import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AlumniProfile } from '@/lib/constants';
import { COHORTS } from '@/lib/constants';
import Navbar from '@/components/Navbar';
import AlumniCard from '@/components/AlumniCard';
import ProfileDetailModal from '@/components/ProfileDetailModal';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, ZoomIn, ZoomOut, Maximize2, Locate } from 'lucide-react';
import { Label } from '@/components/ui/label';

// Cohort color mapping (grayscale spectrum for dark bg)
const COHORT_COLORS: Record<string, string> = {};
COHORTS.forEach((c, i) => {
  const hue = (i * 360 / COHORTS.length);
  COHORT_COLORS[c] = `hsl(${hue}, 50%, 60%)`;
});

function computeSimilarity(a: AlumniProfile, b: AlumniProfile): number {
  const textA = [a.interests, a.contribute, a.gain, a.title, a.company].filter(Boolean).join(' ').toLowerCase();
  const textB = [b.interests, b.contribute, b.gain, b.title, b.company].filter(Boolean).join(' ').toLowerCase();
  if (!textA || !textB) return 0;
  const wordsA = new Set(textA.split(/\s+/).filter(w => w.length > 1));
  const wordsB = new Set(textB.split(/\s+/).filter(w => w.length > 1));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let shared = 0;
  wordsA.forEach(w => { if (wordsB.has(w)) shared++; });
  return shared / Math.max(wordsA.size, wordsB.size);
}

type GNode = { id: string; x: number; y: number; vx: number; vy: number; profile: AlumniProfile; radius: number };
type GEdge = { from: string; to: string; weight: number };

export default function NetworkGraph() {
  const [profiles, setProfiles] = useState<AlumniProfile[]>([]);
  const [threshold, setThreshold] = useState([0.15]);
  const [cohortFilter, setCohortFilter] = useState('전체');
  const [searchName, setSearchName] = useState('');
  const [selectedNode, setSelectedNode] = useState<AlumniProfile | null>(null);
  const [relatedAlumni, setRelatedAlumni] = useState<{ profile: AlumniProfile; similarity: number }[]>([]);
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
  const simulatingRef = useRef(true);
  const tickCountRef = useRef(0);

  useEffect(() => {
    supabase.from('alumni_profiles').select('*').then(({ data }) => {
      if (data) setProfiles(data as AlumniProfile[]);
    });
  }, []);

  const filteredProfiles = profiles.filter(p =>
    cohortFilter === '전체' || p.cohort === cohortFilter
  );

  // Build graph on data change
  useEffect(() => {
    if (filteredProfiles.length === 0) return;

    const nodes: GNode[] = filteredProfiles.map((p, i) => {
      const angle = (2 * Math.PI * i) / filteredProfiles.length;
      const r = Math.min(600, filteredProfiles.length * 25);
      return {
        id: p.id,
        x: r * Math.cos(angle) + (Math.random() - 0.5) * 100,
        y: r * Math.sin(angle) + (Math.random() - 0.5) * 100,
        vx: 0, vy: 0,
        profile: p,
        radius: 6,
      };
    });

    // Compute connection counts for sizing
    const edges: GEdge[] = [];
    const connCount: Record<string, number> = {};
    for (let i = 0; i < filteredProfiles.length; i++) {
      for (let j = i + 1; j < filteredProfiles.length; j++) {
        const sim = computeSimilarity(filteredProfiles[i], filteredProfiles[j]);
        if (sim >= threshold[0]) {
          edges.push({ from: filteredProfiles[i].id, to: filteredProfiles[j].id, weight: sim });
          connCount[filteredProfiles[i].id] = (connCount[filteredProfiles[i].id] || 0) + 1;
          connCount[filteredProfiles[j].id] = (connCount[filteredProfiles[j].id] || 0) + 1;
        }
      }
    }

    // Size nodes by connections
    nodes.forEach(n => {
      const count = connCount[n.id] || 0;
      n.radius = Math.max(5, Math.min(18, 5 + count * 2));
    });

    nodesRef.current = nodes;
    edgesRef.current = edges;
    simulatingRef.current = true;
    tickCountRef.current = 0;

    // Center view
    viewRef.current = { x: 0, y: 0, scale: 1 };
  }, [filteredProfiles, threshold]);

  // Force-directed simulation + render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let running = true;

    const nodeMap = () => {
      const m = new Map<string, GNode>();
      nodesRef.current.forEach(n => m.set(n.id, n));
      return m;
    };

    const simulate = () => {
      if (!simulatingRef.current) return;
      const tc = tickCountRef.current;
      if (tc > 300) { simulatingRef.current = false; return; }
      tickCountRef.current = tc + 1;
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const alpha = Math.max(0.001, 0.1 * Math.pow(0.95, tc));

      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const force = (800 / (dist * dist)) * alpha;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx -= fx; nodes[i].vy -= fy;
          nodes[j].vx += fx; nodes[j].vy += fy;
        }
      }

      // Attraction along edges
      const nm = nodeMap();
      edges.forEach(e => {
        const a = nm.get(e.from);
        const b = nm.get(e.to);
        if (!a || !b) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const target = 120;
        const force = (dist - target) * 0.005 * alpha * (1 + e.weight);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      });

      // Center gravity
      nodes.forEach(n => {
        n.vx -= n.x * 0.0005 * alpha;
        n.vy -= n.y * 0.0005 * alpha;
      });

      // Apply velocity
      nodes.forEach(n => {
        if (dragRef.current?.type === 'node' && dragRef.current.nodeId === n.id) return;
        n.vx *= 0.8;
        n.vy *= 0.8;
        // Stop very small movements
        if (Math.abs(n.vx) < 0.01) n.vx = 0;
        if (Math.abs(n.vy) < 0.01) n.vy = 0;
        n.x += n.vx;
        n.y += n.vy;
      });
    };

    const draw = () => {
      if (!running) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      simulate();

      const view = viewRef.current;
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const sel = selectedRef.current;
      const hov = hoveredRef.current;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);

      // Dark background
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, w, h);

      // Subtle grid
      ctx.save();
      ctx.translate(w / 2 + view.x, h / 2 + view.y);
      ctx.scale(view.scale, view.scale);

      const gridSize = 80;
      const visibleLeft = (-w / 2 - view.x) / view.scale;
      const visibleTop = (-h / 2 - view.y) / view.scale;
      const visibleRight = (w / 2 - view.x) / view.scale;
      const visibleBottom = (h / 2 - view.y) / view.scale;

      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 0.5 / view.scale;
      const startX = Math.floor(visibleLeft / gridSize) * gridSize;
      const startY = Math.floor(visibleTop / gridSize) * gridSize;
      for (let gx = startX; gx <= visibleRight; gx += gridSize) {
        ctx.beginPath(); ctx.moveTo(gx, visibleTop); ctx.lineTo(gx, visibleBottom); ctx.stroke();
      }
      for (let gy = startY; gy <= visibleBottom; gy += gridSize) {
        ctx.beginPath(); ctx.moveTo(visibleLeft, gy); ctx.lineTo(visibleRight, gy); ctx.stroke();
      }

      // Connected node set for selected
      const connectedToSel = new Set<string>();
      if (sel) {
        edges.forEach(e => {
          if (e.from === sel) connectedToSel.add(e.to);
          if (e.to === sel) connectedToSel.add(e.from);
        });
      }

      // Draw edges
      edges.forEach(e => {
        const from = nodes.find(n => n.id === e.from);
        const to = nodes.find(n => n.id === e.to);
        if (!from || !to) return;

        const isHighlighted = sel && (e.from === sel || e.to === sel);
        const isHovEdge = hov && (e.from === hov || e.to === hov);
        const dimmed = sel && !isHighlighted;

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);

        if (isHighlighted) {
          ctx.strokeStyle = `rgba(255,255,255,0.5)`;
          ctx.lineWidth = (1 + e.weight * 3) / view.scale;
        } else if (isHovEdge) {
          ctx.strokeStyle = `rgba(255,255,255,0.3)`;
          ctx.lineWidth = (1 + e.weight * 2) / view.scale;
        } else {
          ctx.strokeStyle = dimmed ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)';
          ctx.lineWidth = 0.5 / view.scale;
        }
        ctx.stroke();
      });

      // Draw nodes
      nodes.forEach(n => {
        const isSel = n.id === sel;
        const isHov = n.id === hov;
        const isConn = connectedToSel.has(n.id);
        const dimmed = sel && !isSel && !isConn;
        const color = COHORT_COLORS[n.profile.cohort] || 'hsl(0,0%,60%)';
        const r = n.radius / view.scale;

        // Glow for selected/hovered
        if (isSel || isHov) {
          const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4);
          grad.addColorStop(0, isSel ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)');
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.beginPath();
          ctx.arc(n.x, n.y, r * 4, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, isSel ? r * 1.5 : isHov ? r * 1.2 : r, 0, Math.PI * 2);
        ctx.fillStyle = dimmed ? 'rgba(255,255,255,0.1)' : color;
        ctx.globalAlpha = dimmed ? 0.3 : 1;
        ctx.fill();
        ctx.globalAlpha = 1;

        if (isSel) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2 / view.scale;
          ctx.stroke();
        }

        // Label
        if (view.scale > 0.4 || isSel || isHov || isConn) {
          const fontSize = Math.max(10, 12 / view.scale);
          ctx.font = `${isSel || isHov ? '600' : '400'} ${fontSize}px "Noto Sans KR", sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = dimmed ? 'rgba(255,255,255,0.15)' : isSel ? '#fff' : isConn ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.6)';
          ctx.fillText(n.profile.full_name, n.x, n.y + (isSel ? r * 1.5 : r) + fontSize + 2);
        }
      });

      ctx.restore();
      ctx.restore();

      // Draw minimap
      drawMinimap(w, h);

      animRef.current = requestAnimationFrame(draw);
    };

    const drawMinimap = (canvasW: number, canvasH: number) => {
      const miniCanvas = minimapRef.current;
      if (!miniCanvas) return;
      const mCtx = miniCanvas.getContext('2d');
      if (!mCtx) return;
      const dpr = window.devicePixelRatio || 1;
      const mw = miniCanvas.offsetWidth;
      const mh = miniCanvas.offsetHeight;
      if (miniCanvas.width !== mw * dpr || miniCanvas.height !== mh * dpr) {
        miniCanvas.width = mw * dpr;
        miniCanvas.height = mh * dpr;
      }

      mCtx.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
      mCtx.save();
      mCtx.scale(dpr, dpr);

      mCtx.fillStyle = 'rgba(20,20,20,0.9)';
      mCtx.strokeStyle = 'rgba(255,255,255,0.15)';
      mCtx.lineWidth = 1;
      mCtx.beginPath();
      mCtx.roundRect(0, 0, mw, mh, 6);
      mCtx.fill();
      mCtx.stroke();

      const nodes = nodesRef.current;
      if (nodes.length === 0) { mCtx.restore(); return; }

      // Find bounds
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      nodes.forEach(n => {
        minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
      });
      const pad = 50;
      minX -= pad; maxX += pad; minY -= pad; maxY += pad;
      const rangeX = maxX - minX || 1;
      const rangeY = maxY - minY || 1;
      const scaleM = Math.min((mw - 16) / rangeX, (mh - 16) / rangeY);

      mCtx.save();
      mCtx.translate(mw / 2, mh / 2);
      mCtx.scale(scaleM, scaleM);
      mCtx.translate(-(minX + rangeX / 2), -(minY + rangeY / 2));

      // Edges
      edgesRef.current.forEach(e => {
        const from = nodes.find(n => n.id === e.from);
        const to = nodes.find(n => n.id === e.to);
        if (!from || !to) return;
        mCtx.beginPath();
        mCtx.moveTo(from.x, from.y);
        mCtx.lineTo(to.x, to.y);
        mCtx.strokeStyle = 'rgba(255,255,255,0.1)';
        mCtx.lineWidth = 1 / scaleM;
        mCtx.stroke();
      });

      // Nodes
      nodes.forEach(n => {
        mCtx.beginPath();
        mCtx.arc(n.x, n.y, 3 / scaleM, 0, Math.PI * 2);
        mCtx.fillStyle = COHORT_COLORS[n.profile.cohort] || '#666';
        mCtx.fill();
      });

      // Viewport rect
      const view = viewRef.current;
      const vl = (-canvasW / 2 - view.x) / view.scale;
      const vt = (-canvasH / 2 - view.y) / view.scale;
      const vw = canvasW / view.scale;
      const vh = canvasH / view.scale;
      mCtx.strokeStyle = 'rgba(255,255,255,0.5)';
      mCtx.lineWidth = 1.5 / scaleM;
      mCtx.strokeRect(vl, vt, vw, vh);

      mCtx.restore();
      mCtx.restore();
    };

    animRef.current = requestAnimationFrame(draw);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [filteredProfiles, threshold]);

  // Sync selectedRef
  useEffect(() => {
    selectedRef.current = selectedNode?.id || null;
  }, [selectedNode]);

  const screenToWorld = useCallback((sx: number, sy: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: sx, y: sy };
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const view = viewRef.current;
    return {
      x: (sx - w / 2 - view.x) / view.scale,
      y: (sy - h / 2 - view.y) / view.scale,
    };
  }, []);

  const findNodeAt = useCallback((wx: number, wy: number) => {
    const view = viewRef.current;
    return nodesRef.current.find(n => {
      const r = (n.radius / view.scale) * 1.5;
      return Math.hypot(n.x - wx, n.y - wy) < r;
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);
    const node = findNodeAt(world.x, world.y);

    if (node) {
      dragRef.current = { type: 'node', nodeId: node.id, startX: world.x, startY: world.y, startViewX: node.x, startViewY: node.y };
      // Wake up simulation briefly when dragging a node
      simulatingRef.current = true;
      tickCountRef.current = Math.max(tickCountRef.current, 250); // short burst
    } else {
      dragRef.current = { type: 'pan', startX: e.clientX, startY: e.clientY, startViewX: viewRef.current.x, startViewY: viewRef.current.y };
    }
  }, [screenToWorld, findNodeAt]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (dragRef.current) {
      if (dragRef.current.type === 'pan') {
        viewRef.current.x = dragRef.current.startViewX + (e.clientX - dragRef.current.startX);
        viewRef.current.y = dragRef.current.startViewY + (e.clientY - dragRef.current.startY);
      } else if (dragRef.current.type === 'node' && dragRef.current.nodeId) {
        const world = screenToWorld(sx, sy);
        const node = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
        if (node) {
          node.x = world.x;
          node.y = world.y;
          node.vx = 0;
          node.vy = 0;
        }
      }
    } else {
      const world = screenToWorld(sx, sy);
      const node = findNodeAt(world.x, world.y);
      hoveredRef.current = node?.id || null;
      if (canvasRef.current) {
        canvasRef.current.style.cursor = node ? 'pointer' : 'grab';
      }
    }
  }, [screenToWorld, findNodeAt]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.type === 'node' && dragRef.current.nodeId) {
      // If barely moved, treat as click
      const rect = canvasRef.current!.getBoundingClientRect();
      const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const moved = Math.hypot(world.x - dragRef.current.startX, world.y - dragRef.current.startY);
      if (moved < 5) {
        const node = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
        if (node) handleNodeClick(node);
      }
    } else if (dragRef.current?.type === 'pan') {
      const moved = Math.hypot(e.clientX - dragRef.current.startX, e.clientY - dragRef.current.startY);
      if (moved < 3) {
        // Click on empty space → deselect
        setSelectedNode(null);
        setRelatedAlumni([]);
      }
    }
    dragRef.current = null;
  }, [screenToWorld]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = canvasRef.current!.offsetWidth;
    const h = canvasRef.current!.offsetHeight;

    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    const newScale = Math.max(0.1, Math.min(5, viewRef.current.scale * factor));

    // Zoom toward cursor
    const wx = (sx - w / 2 - viewRef.current.x) / viewRef.current.scale;
    const wy = (sy - h / 2 - viewRef.current.y) / viewRef.current.scale;
    viewRef.current.x = sx - w / 2 - wx * newScale;
    viewRef.current.y = sy - h / 2 - wy * newScale;
    viewRef.current.scale = newScale;
  }, []);

  const handleNodeClick = (node: GNode) => {
    if (selectedNode && node.profile.id !== selectedNode.id) {
      const isConn = edgesRef.current.some(
        e => (e.from === selectedNode.id && e.to === node.profile.id) || (e.to === selectedNode.id && e.from === node.profile.id)
      );
      if (!isConn) {
        setDetailProfile(node.profile);
        return;
      }
    }
    setSelectedNode(node.profile);
    const related = edgesRef.current
      .filter(e => e.from === node.profile.id || e.to === node.profile.id)
      .map(e => {
        const otherId = e.from === node.profile.id ? e.to : e.from;
        const otherProfile = profiles.find(p => p.id === otherId);
        return otherProfile ? { profile: otherProfile, similarity: e.weight } : null;
      })
      .filter(Boolean) as { profile: AlumniProfile; similarity: number }[];
    related.sort((a, b) => b.similarity - a.similarity);
    setRelatedAlumni(related);
  };

  // Search effect
  useEffect(() => {
    if (!searchName.trim()) { setSelectedNode(null); setRelatedAlumni([]); return; }
    const found = filteredProfiles.find(p =>
      p.full_name.toLowerCase().includes(searchName.toLowerCase()) ||
      (p.nickname || '').toLowerCase().includes(searchName.toLowerCase())
    );
    if (found) {
      setSelectedNode(found);
      // Center view on found node
      const node = nodesRef.current.find(n => n.id === found.id);
      if (node && canvasRef.current) {
        viewRef.current.x = -node.x * viewRef.current.scale;
        viewRef.current.y = -node.y * viewRef.current.scale;
      }
      const related = edgesRef.current
        .filter(e => e.from === found.id || e.to === found.id)
        .map(e => {
          const otherId = e.from === found.id ? e.to : e.from;
          const otherProfile = profiles.find(p => p.id === otherId);
          return otherProfile ? { profile: otherProfile, similarity: e.weight } : null;
        })
        .filter(Boolean) as { profile: AlumniProfile; similarity: number }[];
      related.sort((a, b) => b.similarity - a.similarity);
      setRelatedAlumni(related);
    }
  }, [searchName, filteredProfiles]);

  const handleZoom = (dir: 'in' | 'out') => {
    const factor = dir === 'in' ? 1.3 : 0.7;
    viewRef.current.scale = Math.max(0.1, Math.min(5, viewRef.current.scale * factor));
  };

  const handleFitView = () => {
    const nodes = nodesRef.current;
    if (nodes.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(n => { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); });
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const rangeX = (maxX - minX) || 1;
    const rangeY = (maxY - minY) || 1;
    const scale = Math.min(w / (rangeX + 120), h / (rangeY + 120));
    viewRef.current.scale = Math.min(2, scale);
    viewRef.current.x = -(minX + rangeX / 2) * viewRef.current.scale;
    viewRef.current.y = -(minY + rangeY / 2) * viewRef.current.scale;
  };

  const handleLocateSelected = () => {
    if (!selectedNode) return;
    const node = nodesRef.current.find(n => n.id === selectedNode.id);
    if (node) {
      viewRef.current.x = -node.x * viewRef.current.scale;
      viewRef.current.y = -node.y * viewRef.current.scale;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-[1800px] mx-auto px-4 py-4">
        <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-80px)]">
          {/* Sidebar - white background */}
          <div className="lg:w-72 space-y-3 flex-shrink-0 overflow-y-auto pr-1">
            <h1 className="text-xl font-bold text-foreground tracking-tight">네트워크 그래프</h1>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">검색</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-9 h-8 text-sm"
                  placeholder="이름 또는 닉네임..."
                  value={searchName}
                  onChange={e => setSearchName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">기수</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                <Button
                  variant={cohortFilter === '전체' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCohortFilter('전체')}
                  className={`text-xs h-6 px-2 ${cohortFilter === '전체' ? '' : ''}`}
                >
                  전체
                </Button>
                {COHORTS.map(c => (
                  <Button
                    key={c}
                    variant={cohortFilter === c ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCohortFilter(c)}
                    className="text-xs h-6 px-2"
                  >
                    {c}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                유사도 임계값: {Math.round(threshold[0] * 100)}%
              </Label>
              <Slider
                value={threshold}
                onValueChange={setThreshold}
                min={0} max={1} step={0.05}
                className="mt-2"
              />
            </div>

            {/* Legend */}
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

            {/* Selected node info */}
            {selectedNode && (
              <div className="space-y-2 pt-2 border-t border-border">
                <Card>
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

                {relatedAlumni.length > 0 && (
                  <>
                    <h4 className="text-xs font-semibold text-muted-foreground">관련 동문 ({relatedAlumni.length})</h4>
                    <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                      {relatedAlumni.map(r => (
                        <div
                          key={r.profile.id}
                          className="flex items-center gap-2 p-2 rounded-md bg-secondary/50 border border-border/50 cursor-pointer hover:bg-accent transition-colors"
                          onClick={() => setDetailProfile(r.profile)}
                        >
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COHORT_COLORS[r.profile.cohort] }} />
                          <span className="text-xs text-foreground truncate flex-1">{r.profile.full_name}</span>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">{Math.round(r.similarity * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Graph */}
          <div className="flex-1 relative rounded-lg overflow-hidden border border-neutral-800 bg-[#0a0a0a]">
            <canvas
              ref={canvasRef}
              className="w-full h-full"
              style={{ minHeight: 500 }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => { dragRef.current = null; hoveredRef.current = null; }}
              onWheel={handleWheel}
            />

            {/* Controls overlay */}
            <div className="absolute top-3 right-3 flex flex-col gap-1.5">
              <Button size="icon" variant="outline" onClick={() => handleZoom('in')}
                className="h-8 w-8 bg-neutral-900/80 border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-800 backdrop-blur-sm">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" onClick={() => handleZoom('out')}
                className="h-8 w-8 bg-neutral-900/80 border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-800 backdrop-blur-sm">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" onClick={handleFitView}
                className="h-8 w-8 bg-neutral-900/80 border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-800 backdrop-blur-sm">
                <Maximize2 className="h-4 w-4" />
              </Button>
              {selectedNode && (
                <Button size="icon" variant="outline" onClick={handleLocateSelected}
                  className="h-8 w-8 bg-neutral-900/80 border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-800 backdrop-blur-sm">
                  <Locate className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Minimap */}
            <canvas
              ref={minimapRef}
              className="absolute bottom-3 right-3 rounded-md"
              style={{ width: 160, height: 120 }}
            />

            {/* Node count */}
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
