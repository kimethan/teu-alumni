import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AlumniProfile } from '@/lib/constants';
import { COHORTS } from '@/lib/constants';
import Navbar from '@/components/Navbar';
import ProfileDetailModal from '@/components/ProfileDetailModal';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, ZoomIn, ZoomOut, Maximize2, Locate, Sparkles, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';

const COHORT_COLORS: Record<string, string> = {};
COHORTS.forEach((c, i) => {
  const hue = (i * 360 / COHORTS.length);
  COHORT_COLORS[c] = `hsl(${hue}, 60%, 65%)`;
});

// 필드별 가중치 유사도 계산 (관심사3, 기여2.5, 기대2.5, 직장1.5, 직함1)
function computeSimilarity(a: AlumniProfile, b: AlumniProfile): number {
  type ProfileField = 'interests' | 'contribute' | 'gain' | 'company' | 'title';
  const fields: { key: ProfileField; weight: number }[] = [
    { key: 'interests', weight: 3 },
    { key: 'contribute', weight: 2.5 },
    { key: 'gain', weight: 2.5 },
    { key: 'company', weight: 1.5 },
    { key: 'title', weight: 1 },
  ];
  let totalWeight = 0, weightedSim = 0;
  for (const { key, weight } of fields) {
    const textA = ((a[key] as string) || '').toLowerCase();
    const textB = ((b[key] as string) || '').toLowerCase();
    if (!textA || !textB) continue;
    const wordsA = new Set(textA.split(/[\s,，.。!?()\[\]]+/).filter(w => w.length > 1));
    const wordsB = new Set(textB.split(/[\s,，.。!?()\[\]]+/).filter(w => w.length > 1));
    if (!wordsA.size || !wordsB.size) continue;
    let shared = 0;
    wordsA.forEach(w => { if (wordsB.has(w)) shared++; });
    weightedSim += (shared / Math.max(wordsA.size, wordsB.size)) * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSim / totalWeight : 0;
}

// LLM 기반 추천 (Anthropic Claude API)
async function getLLMRecommendations(
  selected: AlumniProfile,
  others: AlumniProfile[]
): Promise<{ id: string; score: number; reason: string }[]> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey || !others.length) return [];
  const sel = `이름:${selected.full_name} 관심사:${selected.interests || '-'} 기여:${selected.contribute || '-'} 기대:${selected.gain || '-'} 직장:${selected.company || '-'} 직함:${selected.title || '-'}`;
  const list = others.slice(0, 60).map(p =>
    `ID:${p.id}|이름:${p.full_name}|관심사:${p.interests || ''}|기여:${p.contribute || ''}|기대:${p.gain || ''}|직장:${p.company || ''}|직함:${p.title || ''}`
  ).join('\n');
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `아래 알럼나이와 가장 잘 맞는 사람 TOP 5를 추천해줘. 관심사, 기여, 기대, 직장, 직함을 종합 평가해.\n\n[선택]\n${sel}\n\n[후보]\n${list}\n\nJSON 배열만 응답(다른 텍스트 없이):[{"id":"...","score":0.9,"reason":"이유 15자 이내"}]`
        }]
      })
    });
    const data = await res.json();
    return JSON.parse((data.content?.[0]?.text || '[]').replace(/```json|```/g, '').trim());
  } catch { return []; }
}

type GNode = { id: string; x: number; y: number; vx: number; vy: number; profile: AlumniProfile; radius: number };
type GEdge = { from: string; to: string; weight: number };

export default function NetworkGraph() {
  const [profiles, setProfiles] = useState<AlumniProfile[]>([]);
  const [threshold, setThreshold] = useState([0.08]);
  const [cohortFilter, setCohortFilter] = useState('전체');
  const [searchName, setSearchName] = useState('');
  const [selectedNode, setSelectedNode] = useState<AlumniProfile | null>(null);
  const [relatedAlumni, setRelatedAlumni] = useState<{ profile: AlumniProfile; similarity: number }[]>([]);
  const [llmRecs, setLlmRecs] = useState<{ id: string; score: number; reason: string }[]>([]);
  const [llmLoading, setLlmLoading] = useState(false);
  const [detailProfile, setDetailProfile] = useState<AlumniProfile | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GNode[]>([]);
  const edgesRef = useRef<GEdge[]>([]);
  const animRef = useRef<number>(0);
  const viewRef = useRef({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ type: 'pan' | 'node'; nodeId?: string; startX: number; startY: number; startViewX: number; startViewY: number } | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const simRef = useRef(true);
  const tickRef = useRef(0);

  useEffect(() => {
    supabase.from('alumni_profiles').select('*').then(({ data }) => {
      if (data) setProfiles(data as AlumniProfile[]);
    });
  }, []);

  const filtered = profiles.filter(p => cohortFilter === '전체' || p.cohort === cohortFilter);

  useEffect(() => {
    if (!filtered.length) return;
    const nodes: GNode[] = filtered.map((p, i) => {
      const angle = (2 * Math.PI * i) / filtered.length;
      const r = Math.min(480, filtered.length * 22);
      return {
        id: p.id,
        x: r * Math.cos(angle) + (Math.random() - 0.5) * 60,
        y: r * Math.sin(angle) + (Math.random() - 0.5) * 60,
        vx: 0, vy: 0, profile: p, radius: 7
      };
    });
    const edges: GEdge[] = [];
    const connCount: Record<string, number> = {};
    for (let i = 0; i < filtered.length; i++) {
      for (let j = i + 1; j < filtered.length; j++) {
        const sim = computeSimilarity(filtered[i], filtered[j]);
        if (sim >= threshold[0]) {
          edges.push({ from: filtered[i].id, to: filtered[j].id, weight: sim });
          connCount[filtered[i].id] = (connCount[filtered[i].id] || 0) + 1;
          connCount[filtered[j].id] = (connCount[filtered[j].id] || 0) + 1;
        }
      }
    }
    nodes.forEach(n => { n.radius = Math.max(6, Math.min(20, 6 + (connCount[n.id] || 0) * 2)); });
    nodesRef.current = nodes;
    edgesRef.current = edges;
    simRef.current = true;
    tickRef.current = 0;
    viewRef.current = { x: 0, y: 0, scale: 1 };
  }, [filtered, threshold]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let running = true;

    const simulate = () => {
      if (!simRef.current) return;
      const tc = tickRef.current;
      if (tc > 260) { simRef.current = false; return; }
      tickRef.current = tc + 1;
      const nodes = nodesRef.current, edges = edgesRef.current;
      const alpha = Math.max(0.001, 0.12 * Math.pow(0.94, tc));
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const force = (900 / (dist * dist)) * alpha;
          nodes[i].vx -= dx / dist * force; nodes[i].vy -= dy / dist * force;
          nodes[j].vx += dx / dist * force; nodes[j].vy += dy / dist * force;
        }
      }
      const nm = new Map<string, GNode>();
      nodes.forEach(n => nm.set(n.id, n));
      edges.forEach(e => {
        const a = nm.get(e.from), b = nm.get(e.to);
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const target = 90 + (1 - e.weight) * 70;
        const force = (dist - target) * 0.007 * alpha * (1 + e.weight * 2);
        a.vx += dx / dist * force; a.vy += dy / dist * force;
        b.vx -= dx / dist * force; b.vy -= dy / dist * force;
      });
      nodes.forEach(n => {
        if (dragRef.current?.type === 'node' && dragRef.current.nodeId === n.id) return;
        n.vx -= n.x * 0.001 * alpha; n.vy -= n.y * 0.001 * alpha;
        n.vx *= 0.75; n.vy *= 0.75;
        if (Math.abs(n.vx) < 0.01) n.vx = 0;
        if (Math.abs(n.vy) < 0.01) n.vy = 0;
        n.x += n.vx; n.y += n.vy;
      });
    };

    const draw = () => {
      if (!running) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.offsetWidth, h = canvas.offsetHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr; canvas.height = h * dpr;
      }
      simulate();
      const view = viewRef.current, nodes = nodesRef.current, edges = edgesRef.current;
      const sel = selectedRef.current, hov = hoveredRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save(); ctx.scale(dpr, dpr);
      ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2 + view.x, h / 2 + view.y);
      ctx.scale(view.scale, view.scale);
      const vl = (-w / 2 - view.x) / view.scale, vt = (-h / 2 - view.y) / view.scale;
      const vr = (w / 2 - view.x) / view.scale, vb = (h / 2 - view.y) / view.scale;
      ctx.strokeStyle = 'rgba(255,255,255,0.025)'; ctx.lineWidth = 1 / view.scale;
      for (let gx = Math.floor(vl / 100) * 100; gx <= vr; gx += 100) {
        ctx.beginPath(); ctx.moveTo(gx, vt); ctx.lineTo(gx, vb); ctx.stroke();
      }
      for (let gy = Math.floor(vt / 100) * 100; gy <= vb; gy += 100) {
        ctx.beginPath(); ctx.moveTo(vl, gy); ctx.lineTo(vr, gy); ctx.stroke();
      }
      const connSel = new Set<string>();
      if (sel) edges.forEach(e => {
        if (e.from === sel) connSel.add(e.to);
        if (e.to === sel) connSel.add(e.from);
      });
      // Edges - Obsidian style
      edges.forEach(e => {
        const f = nodes.find(n => n.id === e.from), t = nodes.find(n => n.id === e.to);
        if (!f || !t) return;
        const isHL = sel && (e.from === sel || e.to === sel);
        if (sel && !isHL) return; // 선택 시 비관련 엣지 숨김
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(t.x, t.y);
        if (isHL) {
          ctx.strokeStyle = `rgba(139,92,246,${0.25 + e.weight * 0.75})`;
          ctx.lineWidth = (1.5 + e.weight * 4) / view.scale;
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.04)';
          ctx.lineWidth = 0.5 / view.scale;
        }
        ctx.stroke();
      });
      // Nodes
      nodes.forEach(n => {
        const isSel = n.id === sel, isHov = n.id === hov, isConn = connSel.has(n.id);
        const dimmed = !!(sel && !isSel && !isConn);
        const color = COHORT_COLORS[n.profile.cohort] || '#999';
        const r = n.radius / view.scale;
        if (isSel || isHov) {
          const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 5);
          g.addColorStop(0, isSel ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.12)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.beginPath(); ctx.arc(n.x, n.y, r * 5, 0, Math.PI * 2);
          ctx.fillStyle = g; ctx.fill();
        }
        if (isConn && !isSel) {
          const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3.5);
          g.addColorStop(0, 'rgba(139,92,246,0.15)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.beginPath(); ctx.arc(n.x, n.y, r * 3.5, 0, Math.PI * 2);
          ctx.fillStyle = g; ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(n.x, n.y, isSel ? r * 1.45 : isHov ? r * 1.2 : r, 0, Math.PI * 2);
        ctx.globalAlpha = dimmed ? 0.12 : 1;
        ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;
        if (isSel) { ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 2 / view.scale; ctx.stroke(); }
        else if (isConn) { ctx.strokeStyle = 'rgba(139,92,246,0.6)'; ctx.lineWidth = 1.5 / view.scale; ctx.stroke(); }
        if (view.scale > 0.35 || isSel || isHov || isConn) {
          const fs = Math.max(9, 11 / view.scale);
          ctx.font = `${isSel || isHov ? '600' : '400'} ${fs}px "Noto Sans KR", sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = dimmed ? 'rgba(255,255,255,0.08)' : isSel ? '#e9d5ff' : isConn ? 'rgba(196,167,255,0.9)' : isHov ? '#fff' : 'rgba(255,255,255,0.5)';
          ctx.globalAlpha = dimmed ? 0.25 : 1;
          ctx.fillText(n.profile.full_name, n.x, n.y + (isSel ? r * 1.45 : r) + fs + 2);
          ctx.globalAlpha = 1;
        }
      });
      ctx.restore(); ctx.restore();
      // Minimap
      const mini = minimapRef.current;
      if (mini) {
        const mc = mini.getContext('2d');
        if (mc) {
          const mw = mini.offsetWidth, mh = mini.offsetHeight;
          if (mini.width !== mw * dpr || mini.height !== mh * dpr) { mini.width = mw * dpr; mini.height = mh * dpr; }
          mc.clearRect(0, 0, mini.width, mini.height); mc.save(); mc.scale(dpr, dpr);
          mc.fillStyle = 'rgba(13,13,13,0.92)'; mc.strokeStyle = 'rgba(139,92,246,0.35)'; mc.lineWidth = 1;
          mc.beginPath(); mc.roundRect(0, 0, mw, mh, 6); mc.fill(); mc.stroke();
          if (nodes.length) {
            let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
            nodes.forEach(n => { mnX = Math.min(mnX, n.x); mxX = Math.max(mxX, n.x); mnY = Math.min(mnY, n.y); mxY = Math.max(mxY, n.y); });
            const pad = 50, rX = (mxX - mnX + pad * 2) || 1, rY = (mxY - mnY + pad * 2) || 1;
            const sM = Math.min((mw - 16) / rX, (mh - 16) / rY);
            mc.save();
            mc.translate(mw / 2, mh / 2); mc.scale(sM, sM);
            mc.translate(-(mnX - pad + rX / 2), -(mnY - pad + rY / 2));
            edges.forEach(e => {
              const f = nodes.find(n => n.id === e.from), t = nodes.find(n => n.id === e.to);
              if (!f || !t) return;
              mc.beginPath(); mc.moveTo(f.x, f.y); mc.lineTo(t.x, t.y);
              mc.strokeStyle = 'rgba(139,92,246,0.15)'; mc.lineWidth = 1 / sM; mc.stroke();
            });
            nodes.forEach(n => {
              mc.beginPath(); mc.arc(n.x, n.y, Math.max(2, n.radius * 0.6) / sM, 0, Math.PI * 2);
              mc.fillStyle = COHORT_COLORS[n.profile.cohort] || '#666'; mc.fill();
            });
            mc.strokeStyle = 'rgba(139,92,246,0.7)'; mc.lineWidth = 2 / sM;
            mc.strokeRect((-w / 2 - view.x) / view.scale, (-h / 2 - view.y) / view.scale, w / view.scale, h / view.scale);
            mc.restore();
          }
          mc.restore();
        }
      }
      animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [filtered, threshold]);

  useEffect(() => { selectedRef.current = selectedNode?.id || null; }, [selectedNode]);

  const s2w = useCallback((sx: number, sy: number) => {
    const c = canvasRef.current;
    if (!c) return { x: sx, y: sy };
    const v = viewRef.current;
    return { x: (sx - c.offsetWidth / 2 - v.x) / v.scale, y: (sy - c.offsetHeight / 2 - v.y) / v.scale };
  }, []);

  const findAt = useCallback((wx: number, wy: number) =>
    nodesRef.current.find(n => Math.hypot(n.x - wx, n.y - wy) < (n.radius / viewRef.current.scale) * 1.8)
  , []);

  const handleNodeClick = useCallback(async (node: GNode) => {
    setSelectedNode(node.profile);
    setLlmRecs([]);
    const related = edgesRef.current
      .filter(e => e.from === node.profile.id || e.to === node.profile.id)
      .map(e => {
        const oid = e.from === node.profile.id ? e.to : e.from;
        const op = profiles.find(p => p.id === oid);
        return op ? { profile: op, similarity: e.weight } : null;
      })
      .filter(Boolean) as { profile: AlumniProfile; similarity: number }[];
    related.sort((a, b) => b.similarity - a.similarity);
    setRelatedAlumni(related);
    const others = profiles.filter(p => p.id !== node.profile.id);
    if (others.length && import.meta.env.VITE_ANTHROPIC_API_KEY) {
      setLlmLoading(true);
      try { setLlmRecs(await getLLMRecommendations(node.profile, others)); }
      finally { setLlmLoading(false); }
    }
  }, [profiles]);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const w = s2w(e.clientX - rect.left, e.clientY - rect.top);
    const node = findAt(w.x, w.y);
    if (node) {
      dragRef.current = { type: 'node', nodeId: node.id, startX: w.x, startY: w.y, startViewX: node.x, startViewY: node.y };
      simRef.current = true; tickRef.current = Math.max(tickRef.current, 230);
    } else {
      dragRef.current = { type: 'pan', startX: e.clientX, startY: e.clientY, startViewX: viewRef.current.x, startViewY: viewRef.current.y };
    }
  }, [s2w, findAt]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    if (dragRef.current) {
      if (dragRef.current.type === 'pan') {
        viewRef.current.x = dragRef.current.startViewX + (e.clientX - dragRef.current.startX);
        viewRef.current.y = dragRef.current.startViewY + (e.clientY - dragRef.current.startY);
      } else if (dragRef.current.nodeId) {
        const ww = s2w(sx, sy);
        const n = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
        if (n) { n.x = ww.x; n.y = ww.y; n.vx = 0; n.vy = 0; }
      }
    } else {
      const ww = s2w(sx, sy), n = findAt(ww.x, ww.y);
      hoveredRef.current = n?.id || null;
      if (canvasRef.current) canvasRef.current.style.cursor = n ? 'pointer' : 'grab';
    }
  }, [s2w, findAt]);

  const onMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.type === 'node' && dragRef.current.nodeId) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const ww = s2w(e.clientX - rect.left, e.clientY - rect.top);
      if (Math.hypot(ww.x - dragRef.current.startX, ww.y - dragRef.current.startY) < 5) {
        const n = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
        if (n) handleNodeClick(n);
      }
    } else if (dragRef.current?.type === 'pan') {
      if (Math.hypot(e.clientX - dragRef.current.startX, e.clientY - dragRef.current.startY) < 3) {
        setSelectedNode(null); setRelatedAlumni([]); setLlmRecs([]);
      }
    }
    dragRef.current = null;
  }, [s2w, handleNodeClick]);

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const cw = canvasRef.current!.offsetWidth, ch = canvasRef.current!.offsetHeight;
    const ns = Math.max(0.1, Math.min(5, viewRef.current.scale * (e.deltaY < 0 ? 1.08 : 0.92)));
    const wx = (sx - cw / 2 - viewRef.current.x) / viewRef.current.scale;
    const wy = (sy - ch / 2 - viewRef.current.y) / viewRef.current.scale;
    viewRef.current.x = sx - cw / 2 - wx * ns;
    viewRef.current.y = sy - ch / 2 - wy * ns;
    viewRef.current.scale = ns;
  }, []);

  useEffect(() => {
    if (!searchName.trim()) { setSelectedNode(null); setRelatedAlumni([]); return; }
    const found = filtered.find(p =>
      p.full_name.toLowerCase().includes(searchName.toLowerCase()) ||
      (p.nickname || '').toLowerCase().includes(searchName.toLowerCase())
    );
    if (found) {
      handleNodeClick({ id: found.id, x: 0, y: 0, vx: 0, vy: 0, profile: found, radius: 7 });
      const n = nodesRef.current.find(n => n.id === found.id);
      if (n && canvasRef.current) {
        viewRef.current.x = -n.x * viewRef.current.scale;
        viewRef.current.y = -n.y * viewRef.current.scale;
      }
    }
  }, [searchName, filtered]);

  const zoom = (d: 'in' | 'out') => {
    viewRef.current.scale = Math.max(0.1, Math.min(5, viewRef.current.scale * (d === 'in' ? 1.3 : 0.7)));
  };
  const fitView = () => {
    const ns = nodesRef.current; if (!ns.length) return;
    let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
    ns.forEach(n => { mnX = Math.min(mnX, n.x); mxX = Math.max(mxX, n.x); mnY = Math.min(mnY, n.y); mxY = Math.max(mxY, n.y); });
    const c = canvasRef.current; if (!c) return;
    viewRef.current.scale = Math.min(2, c.offsetWidth / ((mxX - mnX) + 120), c.offsetHeight / ((mxY - mnY) + 120));
    viewRef.current.x = -((mnX + mxX) / 2) * viewRef.current.scale;
    viewRef.current.y = -((mnY + mxY) / 2) * viewRef.current.scale;
  };
  const locate = () => {
    if (!selectedNode) return;
    const n = nodesRef.current.find(n => n.id === selectedNode.id);
    if (n) { viewRef.current.x = -n.x * viewRef.current.scale; viewRef.current.y = -n.y * viewRef.current.scale; }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-[1800px] mx-auto px-4 py-4">
        <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-80px)]">
          {/* Sidebar */}
          <div className="lg:w-72 space-y-3 flex-shrink-0 overflow-y-auto pr-1">
            <h1 className="text-xl font-bold text-foreground tracking-tight">네트워크 그래프</h1>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">검색</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="pl-9 h-8 text-sm" placeholder="이름 또는 닉네임..." value={searchName} onChange={e => setSearchName(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">기수</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                <Button variant={cohortFilter === '전체' ? 'default' : 'outline'} size="sm" onClick={() => setCohortFilter('전체')} className="text-xs h-6 px-2">전체</Button>
                {COHORTS.map(c => (
                  <Button key={c} variant={cohortFilter === c ? 'default' : 'outline'} size="sm" onClick={() => setCohortFilter(c)} className="text-xs h-6 px-2">{c}</Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">유사도 임계값: {Math.round(threshold[0] * 100)}%</Label>
              <Slider value={threshold} onValueChange={setThreshold} min={0} max={1} step={0.05} className="mt-2" />
            </div>
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

            {selectedNode && (
              <div className="space-y-2 pt-2 border-t border-border">
                {/* 선택된 프로필 카드 - 클릭시 팝업 */}
                <Card className="cursor-pointer hover:bg-accent transition-colors" onClick={() => setDetailProfile(selectedNode)}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-border">
                      <AvatarImage src={selectedNode.photo_url || ''} />
                      <AvatarFallback className="text-sm">{selectedNode.full_name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{selectedNode.full_name}</p>
                      <div className="flex items-center gap-1.5">
                        <Badge className="text-[10px] h-4 px-1.5" style={{ backgroundColor: COHORT_COLORS[selectedNode.cohort], color: '#000' }}>
                          {selectedNode.cohort}
                        </Badge>
                        {selectedNode.title && <span className="text-[10px] text-muted-foreground">{selectedNode.title}</span>}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 연결된 동문 (유사도 기반) */}
                {relatedAlumni.length > 0 && (
                  <>
                    <h4 className="text-xs font-semibold text-muted-foreground">연결된 동문 ({relatedAlumni.length})</h4>
                    <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                      {relatedAlumni.map(r => (
                        <div key={r.profile.id}
                          className="flex items-center gap-2 p-2 rounded-md bg-secondary/50 border border-border/50 cursor-pointer hover:bg-accent transition-colors"
                          onClick={() => setDetailProfile(r.profile)}>
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COHORT_COLORS[r.profile.cohort] }} />
                          <span className="text-xs text-foreground truncate flex-1">{r.profile.full_name}</span>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">{Math.round(r.similarity * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* AI 추천 동문 */}
                <div className="pt-1">
                  <h4 className="text-xs font-semibold text-purple-400 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> AI 추천 동문
                    {llmLoading && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
                  </h4>
                  {!import.meta.env.VITE_ANTHROPIC_API_KEY && (
                    <p className="text-[10px] text-muted-foreground mt-1">.env에 VITE_ANTHROPIC_API_KEY 추가 시 활성화</p>
                  )}
                  {llmRecs.length > 0 && (
                    <div className="space-y-1.5 mt-1.5 max-h-[200px] overflow-y-auto">
                      {llmRecs.map(rec => {
                        const p = profiles.find(x => x.id === rec.id);
                        if (!p) return null;
                        return (
                          <div key={rec.id}
                            className="flex items-center gap-2 p-2 rounded-md bg-purple-500/10 border border-purple-500/20 cursor-pointer hover:bg-purple-500/20 transition-colors"
                            onClick={() => setDetailProfile(p)}>
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COHORT_COLORS[p.cohort] }} />
                            <div className="flex-1 min-w-0">
                              <span className="text-xs text-foreground truncate block">{p.full_name}</span>
                              <span className="text-[10px] text-purple-400 truncate block">{rec.reason}</span>
                            </div>
                            <span className="text-[10px] text-purple-300 flex-shrink-0">{Math.round(rec.score * 100)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Graph Canvas */}
          <div className="flex-1 relative rounded-lg overflow-hidden border border-neutral-800 bg-[#0d0d0d]">
            <canvas ref={canvasRef} className="w-full h-full" style={{ minHeight: 500 }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={() => { dragRef.current = null; hoveredRef.current = null; }}
              onWheel={onWheel}
            />
            <div className="absolute top-3 right-3 flex flex-col gap-1.5">
              <Button size="icon" variant="outline" onClick={() => zoom('in')} className="h-8 w-8 bg-neutral-900/80 border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-800 backdrop-blur-sm">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" onClick={() => zoom('out')} className="h-8 w-8 bg-neutral-900/80 border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-800 backdrop-blur-sm">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" onClick={fitView} className="h-8 w-8 bg-neutral-900/80 border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-800 backdrop-blur-sm">
                <Maximize2 className="h-4 w-4" />
              </Button>
              {selectedNode && (
                <Button size="icon" variant="outline" onClick={locate} className="h-8 w-8 bg-neutral-900/80 border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-800 backdrop-blur-sm">
                  <Locate className="h-4 w-4" />
                </Button>
              )}
            </div>"absolute bottom-3 right-3 rounded-md" style={{ width: 160, height: 120 }} />
            <div className="absolute bottom-3 left-3 text-[10px] text-neutral-600 font-mono">
              {nodesRef.current.length} nodes · {edgesRef.current.length} edges
            </div>
          </div>
        </div>
      </div>
      <ProfileDetailModal profile={detailProfile} open={!!detailProfile} onClose={() => setDetailProfile(null)} />
    </div>
  );
}
