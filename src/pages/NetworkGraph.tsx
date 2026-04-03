import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AlumniProfile } from '@/lib/constants';
import { COHORTS } from '@/lib/constants';
import Navbar from '@/components/Navbar';
import ProfileDetailModal from '@/components/ProfileDetailModal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, ZoomIn, ZoomOut, Maximize2, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

// ── 색상 팔레트 ──────────────────────────────────────────────
const COHORT_COLORS: Record<string, string> = {};
COHORTS.forEach((c, i) => {
  COHORT_COLORS[c] = `hsl(${(i * 360) / COHORTS.length}, 65%, 62%)`;
});

// ── 유사도 계산 (필드별 가중치) ──────────────────────────────
function similarity(a: AlumniProfile, b: AlumniProfile): number {
  type K = 'interests' | 'contribute' | 'gain' | 'company' | 'title';
  const weighted: [K, number][] = [
    ['interests', 3.0],
    ['contribute', 2.5],
    ['gain', 2.5],
    ['company', 1.5],
    ['title', 1.0],
  ];
  let num = 0, den = 0;
  for (const [k, w] of weighted) {
    const ta = ((a[k] as string) || '').toLowerCase();
    const tb = ((b[k] as string) || '').toLowerCase();
    if (!ta || !tb) continue;
    const wa = new Set(ta.split(/[\s,，.。!?[\]()]+/).filter(x => x.length > 1));
    const wb = new Set(tb.split(/[\s,，.。!?[\]()]+/).filter(x => x.length > 1));
    if (!wa.size || !wb.size) continue;
    let shared = 0;
    wa.forEach(w2 => { if (wb.has(w2)) shared++; });
    num += (shared / Math.max(wa.size, wb.size)) * w;
    den += w;
  }
  return den > 0 ? num / den : 0;
}

// ── LLM 추천 ─────────────────────────────────────────────────
async function llmRecommend(me: AlumniProfile, others: AlumniProfile[]) {
  const key = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!key || !others.length) return [];
  const sel = `이름:${me.full_name} 관심사:${me.interests||'-'} 기여:${me.contribute||'-'} 기대:${me.gain||'-'} 직장:${me.company||'-'} 직함:${me.title||'-'}`;
  const list = others.slice(0, 60).map(p =>
    `ID:${p.id}|이름:${p.full_name}|관심사:${p.interests||''}|기여:${p.contribute||''}|기대:${p.gain||''}|직장:${p.company||''}|직함:${p.title||''}`
  ).join('\n');
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `아래 알럼나이와 가장 잘 맞는 TOP 5 추천해줘. 관심사/기여/기대/직장/직함 종합 평가.\n[나]\n${sel}\n[후보]\n${list}\nJSON 배열만 응답: [{"id":"...","score":0.9,"reason":"15자이내"}]`,
        }],
      }),
    });
    const d = await res.json();
    return JSON.parse((d.content?.[0]?.text || '[]').replace(/```json|```/g, '').trim());
  } catch { return []; }
}

// ── 타입 ─────────────────────────────────────────────────────
type Node = { id: string; x: number; y: number; vx: number; vy: number; profile: AlumniProfile; r: number };
type Edge = { a: string; b: string; w: number };

// ── 컴포넌트 ─────────────────────────────────────────────────
export default function NetworkGraph() {
  const [profiles, setProfiles] = useState<AlumniProfile[]>([]);
  const [threshold, setThreshold] = useState([0.1]);
  const [cohort, setCohort] = useState('전체');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AlumniProfile | null>(null);
  const [related, setRelated] = useState<{ profile: AlumniProfile; score: number }[]>([]);
  const [aiRecs, setAiRecs] = useState<{ id: string; score: number; reason: string }[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [detail, setDetail] = useState<AlumniProfile | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodes = useRef<Node[]>([]);
  const edges = useRef<Edge[]>([]);
  const view = useRef({ x: 0, y: 0, scale: 1 });
  const hovered = useRef<string | null>(null);
  const selectedId = useRef<string | null>(null);
  const drag = useRef<{ type: 'pan' | 'node'; id?: string; ox: number; oy: number; nx?: number; ny?: number } | null>(null);
  const alpha = useRef(1);          // 시뮬레이션 강도 (1→0 으로 줄어듦)
  const simActive = useRef(false);  // 시뮬레이션 실행 중 여부
  const rafId = useRef(0);
  const running = useRef(false);

  // ── Supabase 로드 ─────────────────────────────────────────
  useEffect(() => {
    supabase.from('alumni_profiles').select('*').then(({ data }) => {
      if (data) setProfiles(data as AlumniProfile[]);
    });
  }, []);

  // ── 필터된 프로필 ─────────────────────────────────────────
  const filtered = profiles.filter(p => cohort === '전체' || p.cohort === cohort);

  // ── 그래프 빌드 ───────────────────────────────────────────
  const buildGraph = useCallback(() => {
    if (!filtered.length) return;
    const angle = (i: number) => (2 * Math.PI * i) / filtered.length;
    const R = Math.min(380, filtered.length * 20);
    nodes.current = filtered.map((p, i) => ({
      id: p.id,
      x: R * Math.cos(angle(i)) + (Math.random() - 0.5) * 40,
      y: R * Math.sin(angle(i)) + (Math.random() - 0.5) * 40,
      vx: 0, vy: 0, profile: p, r: 7,
    }));

    const es: Edge[] = [];
    const conn: Record<string, number> = {};
    for (let i = 0; i < filtered.length; i++) {
      for (let j = i + 1; j < filtered.length; j++) {
        const s = similarity(filtered[i], filtered[j]);
        if (s >= threshold[0]) {
          es.push({ a: filtered[i].id, b: filtered[j].id, w: s });
          conn[filtered[i].id] = (conn[filtered[i].id] || 0) + 1;
          conn[filtered[j].id] = (conn[filtered[j].id] || 0) + 1;
        }
      }
    }
    edges.current = es;
    nodes.current.forEach(n => { n.r = Math.max(6, Math.min(18, 5 + (conn[n.id] || 0) * 1.5)); });
    view.current = { x: 0, y: 0, scale: 1 };
    alpha.current = 1;
    simActive.current = true;
  }, [filtered, threshold]);

  useEffect(() => { buildGraph(); }, [buildGraph]);

  // ── 시뮬레이션 1틱 ───────────────────────────────────────
  const tick = () => {
    if (!simActive.current) return;
    const a = alpha.current;
    if (a < 0.001) { simActive.current = false; return; }
    alpha.current *= 0.96; // 쿨다운

    const ns = nodes.current;
    const es = edges.current;
    const map = new Map(ns.map(n => [n.id, n]));

    // 반발력
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const dx = ns[j].x - ns[i].x;
        const dy = ns[j].y - ns[i].y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const f = (800 / (d * d)) * a;
        ns[i].vx -= (dx / d) * f;
        ns[i].vy -= (dy / d) * f;
        ns[j].vx += (dx / d) * f;
        ns[j].vy += (dy / d) * f;
      }
    }
    // 인력 (엣지)
    es.forEach(e => {
      const na = map.get(e.a), nb = map.get(e.b);
      if (!na || !nb) return;
      const dx = nb.x - na.x, dy = nb.y - na.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const target = 80 + (1 - e.w) * 60;
      const f = (d - target) * 0.006 * a * (1 + e.w * 2);
      na.vx += (dx / d) * f; na.vy += (dy / d) * f;
      nb.vx -= (dx / d) * f; nb.vy -= (dy / d) * f;
    });
    // 중심 인력
    ns.forEach(n => {
      if (drag.current?.type === 'node' && drag.current.id === n.id) return;
      n.vx -= n.x * 0.0012 * a;
      n.vy -= n.y * 0.0012 * a;
      n.vx *= 0.78; n.vy *= 0.78;
      n.x += n.vx; n.y += n.vy;
    });
  };

  // ── 렌더 루프 ─────────────────────────────────────────────
  const draw = useCallback(() => {
    if (!running.current) return;
    tick();

    const canvas = canvasRef.current;
    if (!canvas) { rafId.current = requestAnimationFrame(draw); return; }
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr; canvas.height = H * dpr;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.scale(dpr, dpr);

    // 배경
    ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, W, H);

    // 좌표 변환
    ctx.save();
    ctx.translate(W / 2 + view.current.x, H / 2 + view.current.y);
    ctx.scale(view.current.scale, view.current.scale);

    // 그리드
    const vl = (-W / 2 - view.current.x) / view.current.scale;
    const vt = (-H / 2 - view.current.y) / view.current.scale;
    const vr = (W / 2 - view.current.x) / view.current.scale;
    const vb = (H / 2 - view.current.y) / view.current.scale;
    ctx.strokeStyle = 'rgba(255,255,255,0.022)'; ctx.lineWidth = 1 / view.current.scale;
    for (let gx = Math.floor(vl / 100) * 100; gx <= vr; gx += 100) {
      ctx.beginPath(); ctx.moveTo(gx, vt); ctx.lineTo(gx, vb); ctx.stroke();
    }
    for (let gy = Math.floor(vt / 100) * 100; gy <= vb; gy += 100) {
      ctx.beginPath(); ctx.moveTo(vl, gy); ctx.lineTo(vr, gy); ctx.stroke();
    }

    const sel = selectedId.current;
    const hov = hovered.current;
    const ns = nodes.current;
    const es = edges.current;

    // 선택된 노드의 연결 집합
    const connSet = new Set<string>();
    if (sel) es.forEach(e => {
      if (e.a === sel) connSet.add(e.b);
      if (e.b === sel) connSet.add(e.a);
    });

    // 엣지 그리기
    es.forEach(e => {
      const na = ns.find(n => n.id === e.a);
      const nb = ns.find(n => n.id === e.b);
      if (!na || !nb) return;
      const isHL = sel && (e.a === sel || e.b === sel);
      if (sel && !isHL) return; // 미연결 엣지 숨김
      ctx.beginPath(); ctx.moveTo(na.x, na.y); ctx.lineTo(nb.x, nb.y);
      if (isHL) {
        ctx.strokeStyle = `rgba(139,92,246,${0.2 + e.w * 0.8})`;
        ctx.lineWidth = (1 + e.w * 3.5) / view.current.scale;
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.045)';
        ctx.lineWidth = 0.5 / view.current.scale;
      }
      ctx.stroke();
    });

    // 노드 그리기
    ns.forEach(n => {
      const isSel = n.id === sel;
      const isHov = n.id === hov;
      const isConn = connSet.has(n.id);
      const dim = !!(sel && !isSel && !isConn);
      const color = COHORT_COLORS[n.profile.cohort] || '#888';
      const r = n.r / view.current.scale;

      // 글로우 효과
      if (isSel || isHov || isConn) {
        const gr = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * (isSel ? 5 : 3.5));
        gr.addColorStop(0, isSel ? 'rgba(139,92,246,0.28)' : isHov ? 'rgba(255,255,255,0.12)' : 'rgba(139,92,246,0.12)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath(); ctx.arc(n.x, n.y, r * (isSel ? 5 : 3.5), 0, Math.PI * 2);
        ctx.fillStyle = gr; ctx.fill();
      }

      // 노드 원
      ctx.beginPath();
      ctx.arc(n.x, n.y, isSel ? r * 1.4 : isHov ? r * 1.15 : r, 0, Math.PI * 2);
      ctx.globalAlpha = dim ? 0.1 : 1;
      ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;

      if (isSel) { ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 2 / view.current.scale; ctx.stroke(); }
      else if (isConn) { ctx.strokeStyle = 'rgba(139,92,246,0.55)'; ctx.lineWidth = 1.5 / view.current.scale; ctx.stroke(); }

      // 라벨
      if (view.current.scale > 0.35 || isSel || isHov || isConn) {
        const fs = Math.max(9, 11 / view.current.scale);
        ctx.font = `${isSel || isHov ? '600' : '400'} ${fs}px "Noto Sans KR",sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = dim ? 'rgba(255,255,255,0.07)'
          : isSel ? '#e9d5ff'
          : isConn ? 'rgba(196,167,255,0.9)'
          : isHov ? '#fff'
          : 'rgba(255,255,255,0.48)';
        ctx.globalAlpha = dim ? 0.2 : 1;
        ctx.fillText(n.profile.full_name, n.x, n.y + r * 1.4 + fs + 1);
        ctx.globalAlpha = 1;
      }
    });

    ctx.restore(); ctx.restore();
    rafId.current = requestAnimationFrame(draw);
  }, []);

  // ── rAF 시작/종료 ─────────────────────────────────────────
  useEffect(() => {
    running.current = true;
    rafId.current = requestAnimationFrame(draw);
    return () => { running.current = false; cancelAnimationFrame(rafId.current); };
  }, [draw]);

  // ── selectedId 동기화 ─────────────────────────────────────
  useEffect(() => { selectedId.current = selected?.id || null; }, [selected]);

  // ── 좌표 변환 헬퍼 ───────────────────────────────────────
  const toWorld = (sx: number, sy: number) => {
    const c = canvasRef.current!;
    return {
      x: (sx - c.offsetWidth / 2 - view.current.x) / view.current.scale,
      y: (sy - c.offsetHeight / 2 - view.current.y) / view.current.scale,
    };
  };
  const hitTest = (wx: number, wy: number) =>
    nodes.current.find(n => Math.hypot(n.x - wx, n.y - wy) < (n.r / view.current.scale) * 1.8);

  // ── 노드 클릭 처리 ───────────────────────────────────────
  const handleNodeClick = useCallback(async (n: Node) => {
    setSelected(n.profile);
    setAiRecs([]);
    const rel = edges.current
      .filter(e => e.a === n.id || e.b === n.id)
      .map(e => {
        const otherId = e.a === n.id ? e.b : e.a;
        const op = profiles.find(p => p.id === otherId);
        return op ? { profile: op, score: e.w } : null;
      })
      .filter(Boolean) as { profile: AlumniProfile; score: number }[];
    rel.sort((a, b) => b.score - a.score);
    setRelated(rel);

    if (import.meta.env.VITE_ANTHROPIC_API_KEY) {
      setAiLoading(true);
      try { setAiRecs(await llmRecommend(n.profile, profiles.filter(p => p.id !== n.id))); }
      finally { setAiLoading(false); }
    }
  }, [profiles]);

  // ── 마우스 이벤트 ─────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const w = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hit = hitTest(w.x, w.y);
    if (hit) {
      drag.current = { type: 'node', id: hit.id, ox: w.x, oy: w.y, nx: hit.x, ny: hit.y };
      simActive.current = true; alpha.current = Math.max(alpha.current, 0.3);
    } else {
      drag.current = { type: 'pan', ox: e.clientX, oy: e.clientY, nx: view.current.x, ny: view.current.y };
    }
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    if (drag.current) {
      if (drag.current.type === 'pan') {
        view.current.x = drag.current.nx! + (e.clientX - drag.current.ox);
        view.current.y = drag.current.ny! + (e.clientY - drag.current.oy);
      } else {
        const w = toWorld(sx, sy);
        const n = nodes.current.find(nd => nd.id === drag.current!.id);
        if (n) { n.x = w.x; n.y = w.y; n.vx = 0; n.vy = 0; }
      }
    } else {
      const w = toWorld(sx, sy);
      hovered.current = hitTest(w.x, w.y)?.id || null;
      canvasRef.current!.style.cursor = hovered.current ? 'pointer' : 'grab';
    }
  };

  const onMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    if (drag.current.type === 'node' && drag.current.id) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const w = toWorld(e.clientX - rect.left, e.clientY - rect.top);
      const moved = Math.hypot(w.x - drag.current.ox, w.y - drag.current.oy);
      if (moved < 5 / view.current.scale) {
        const n = nodes.current.find(nd => nd.id === drag.current!.id);
        if (n) handleNodeClick(n);
      }
    } else if (drag.current.type === 'pan') {
      const moved = Math.hypot(e.clientX - drag.current.ox, e.clientY - drag.current.oy);
      if (moved < 4) { setSelected(null); setRelated([]); setAiRecs([]); }
    }
    drag.current = null;
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const W = canvasRef.current!.offsetWidth, H = canvasRef.current!.offsetHeight;
    const ns = Math.max(0.1, Math.min(5, view.current.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
    const wx = (sx - W / 2 - view.current.x) / view.current.scale;
    const wy = (sy - H / 2 - view.current.y) / view.current.scale;
    view.current.x = sx - W / 2 - wx * ns;
    view.current.y = sy - H / 2 - wy * ns;
    view.current.scale = ns;
  };

  // ── 검색 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!search.trim()) { setSelected(null); setRelated([]); return; }
    const f = filtered.find(p =>
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (p.nickname || '').toLowerCase().includes(search.toLowerCase())
    );
    if (f) {
      const n = nodes.current.find(nd => nd.id === f.id);
      if (n) {
        handleNodeClick(n);
        view.current.x = -n.x * view.current.scale;
        view.current.y = -n.y * view.current.scale;
      }
    }
  }, [search, filtered]);

  // ── 뷰 컨트롤 ─────────────────────────────────────────────
  const zoom = (d: 'in' | 'out') => {
    view.current.scale = Math.max(0.1, Math.min(5, view.current.scale * (d === 'in' ? 1.3 : 0.77)));
  };
  const fitView = () => {
    const ns = nodes.current; if (!ns.length) return;
    let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
    ns.forEach(n => { mnX = Math.min(mnX, n.x); mxX = Math.max(mxX, n.x); mnY = Math.min(mnY, n.y); mxY = Math.max(mxY, n.y); });
    const c = canvasRef.current!;
    const s = Math.min(1.8, c.offsetWidth / (mxX - mnX + 160), c.offsetHeight / (mxY - mnY + 160));
    view.current.scale = s;
    view.current.x = -((mnX + mxX) / 2) * s;
    view.current.y = -((mnY + mxY) / 2) * s;
  };

  // ── 렌더 ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-[1800px] mx-auto px-4 py-4">
        <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-80px)]">

          {/* 사이드바 */}
          <div className="lg:w-�2 flex-shrink-0 space-y-3 overflow-y-auto pr-1">
            <h1 className="text-xl font-bold tracking-tight">네트워크 그래프</h1>

            {/* 검색 */}
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">검색</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="pl-9 h-8 text-sm" placeholder="이름 또는 닉네임…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>

            {/* 기수 필터 */}
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">기수</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                <Button variant={cohort === '전체' ? 'default' : 'outline'} size="sm" onClick={() => setCohort('전체')} className="text-xs h-6 px-2">전체</Button>
                {COHORTS.map(c => (
                  <Button key={c} variant={cohort === c ? 'default' : 'outline'} size="sm" onClick={() => setCohort(c)} className="text-xs h-6 px-2">{c}</Button>
                ))}
              </div>
            </div>

            {/* 유사도 임계값 */}
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">유사도 임계값: {Math.round(threshold[0] * 100)}%</Label>
              <Slider value={threshold} onValueChange={setThreshold} min={0} max={1} step={0.05} className="mt-2" />
            </div>

            {/* 범례 */}
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">범례</Label>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                {COHORTS.map(c => (
                  <div key={c} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COHORT_COLORS[c] }} />
                    <span className="text-[10px] text-muted-foreground">{c}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 선택된 노드 */}
            {selected && (
              <div className="space-y-2 pt-2 border-t border-border">
                <Card className="cursor-pointer hover:bg-accent transition-colors" onClick={() => setDetail(selected)}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-border">
                      <AvatarImage src={selected.photo_url || ''} />
                      <AvatarFallback className="text-sm">{selected.full_name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{selected.full_name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge className="text-[10px] h-4 px-1.5" style={{ backgroundColor: COHORT_COLORS[selected.cohort], color: '#000' }}>{selected.cohort}</Badge>
                        {selected.title && <span className="text-[10px] text-muted-foreground truncate">{selected.title}</span>}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 연결된 동문 */}
                {related.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-muted-foreground">연결된 동문 ({related.length})</p>
                    <div className="space-y-1 max-h-[160px] overflow-y-auto">
                      {related.map(r => (
                        <div key={r.profile.id} className="flex items-center gap-2 p-2 rounded-md bg-secondary/50 border border-border/40 cursor-pointer hover:bg-accent transition-colors" onClick={() => setDetail(r.profile)}>
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COHORT_COLORS[r.profile.cohort] }} />
                          <span className="text-xs truncate flex-1">{r.profile.full_name}</span>
                          <span className="text-[10px] text-muted-foreground">{Math.round(r.score * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* AI 추천 */}
                <div>
                  <p className="text-xs font-semibold text-purple-400 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> AI 추천 동문
                    {aiLoading && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
                  </p>
                  {!import.meta.env.VITE_ANTHROPIC_API_KEY && (
                    <p className="text-[10px] text-muted-foreground mt-1">.env에 VITE_ANTHROPIC_API_KEY 추가 시 활성화</p>
                  )}
                  {aiRecs.length > 0 && (
                    <div className="space-y-1 mt-1.5 max-h-[180px] overflow-y-auto">
                      {aiRecs.map(rec => {
                        const p = profiles.find(x => x.id === rec.id);
                        if (!p) return null;
                        return (
                          <div key={rec.id} className="flex items-center gap-2 p-2 rounded-md bg-purple-500/10 border border-purple-500/20 cursor-pointer hover:bg-purple-500/20 transition-colors" onClick={() => setDetail(p)}>
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COHORT_COLORS[p.cohort] }} />
                            <div className="flex-1 min-w-0">
                              <span className="text-xs truncate block">{p.full_name}</span>
                              <span className="text-[10px] text-purple-400 truncate block">{rec.reason}</span>
                            </div>
                            <span className="text-[10px] text-purple-300">{Math.round(rec.score * 100)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 캔버스 */}
          <div className="flex-1 relative rounded-lg overflow-hidden border border-neutral-800 bg-[#0d0d0d]">
            <canvas
              ref={canvasRef} className="w-full h-full" style={{ minHeight: 400 }}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
              onMouseLeave={() => { drag.current = null; hovered.current = null; }}
              onWheel={onWheel}
            />
            {/* 컨트롤 */}
            <div className="absolute top-3 right-3 flex flex-col gap-1.5">
              {[
                { icon: <ZoomIn className="h-4 w-4" />, fn: () => zoom('in') },
                { icon: <ZoomOut className="h-4 w-4" />, fn: () => zoom('out') },
                { icon: <Maximize2 className="h-4 w-4" />, fn: fitView },
                { icon: <RefreshCw className="h-4 w-4" />, fn: buildGraph },
              ].map((btn, i) => (
                <Button key={i} size="icon" variant="outline" onClick={btn.fn} className="h-8 w-8 bg-neutral-900/80 border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-800 backdrop-blur-sm">
                  {btn.icon}
                </Button>
              ))}
            </div>
            {/* 상태 */}
            <div className="absolute bottom-3 left-3 text-[10px] text-neutral-600 font-mono">
              {nodes.current.length} nodes · {edges.current.length} edges
              {simActive.current && <span className="ml-2 text-purple-500 animate-pulse">● 정렬 중</span>}
            </div>
            {/* 안내 */}
            {!selected && nodes.current.length > 0 && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center">
                <p className="text-xs text-neutral-700">노드를 클릭하면 연관 동문을 볼 수 있어요</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <ProfileDetailModal profile={detail} open={!!detail} onClose={() => setDetail(null)} />
    </div>
  );
}
