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
import { Search } from 'lucide-react';
import { Label } from '@/components/ui/label';

// Simple text similarity using shared words ratio
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

type Node = { id: string; x: number; y: number; profile: AlumniProfile };
type Edge = { from: string; to: string; weight: number };

export default function NetworkGraph() {
  const [profiles, setProfiles] = useState<AlumniProfile[]>([]);
  const [threshold, setThreshold] = useState([0.2]);
  const [cohortFilter, setCohortFilter] = useState('전체');
  const [searchName, setSearchName] = useState('');
  const [selectedNode, setSelectedNode] = useState<AlumniProfile | null>(null);
  const [relatedAlumni, setRelatedAlumni] = useState<{ profile: AlumniProfile; similarity: number }[]>([]);
  const [detailProfile, setDetailProfile] = useState<AlumniProfile | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const animRef = useRef<number>(0);
  const dragRef = useRef<{ nodeId: string | null; offsetX: number; offsetY: number }>({ nodeId: null, offsetX: 0, offsetY: 0 });

  useEffect(() => {
    supabase.from('alumni_profiles').select('*').then(({ data }) => {
      if (data) setProfiles(data as AlumniProfile[]);
    });
  }, []);

  const filteredProfiles = profiles.filter(p =>
    cohortFilter === '전체' || p.cohort === cohortFilter
  );

  // Build graph
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || filteredProfiles.length === 0) return;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = w * window.devicePixelRatio;
    canvas.height = h * window.devicePixelRatio;

    // Create nodes with force-directed-like random positions
    const nodes: Node[] = filteredProfiles.map((p, i) => {
      const angle = (2 * Math.PI * i) / filteredProfiles.length;
      const r = Math.min(w, h) * 0.35;
      return {
        id: p.id,
        x: w / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * 60,
        y: h / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * 60,
        profile: p,
      };
    });

    // Create edges
    const edges: Edge[] = [];
    for (let i = 0; i < filteredProfiles.length; i++) {
      for (let j = i + 1; j < filteredProfiles.length; j++) {
        const sim = computeSimilarity(filteredProfiles[i], filteredProfiles[j]);
        if (sim >= threshold[0]) {
          edges.push({ from: filteredProfiles[i].id, to: filteredProfiles[j].id, weight: sim });
        }
      }
    }

    nodesRef.current = nodes;
    edgesRef.current = edges;
    drawGraph();
  }, [filteredProfiles, threshold, selectedNode]);

  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const nodes = nodesRef.current;
    const edges = edgesRef.current;

    // Draw edges
    edges.forEach(e => {
      const from = nodes.find(n => n.id === e.from);
      const to = nodes.find(n => n.id === e.to);
      if (!from || !to) return;

      const isHighlighted = selectedNode && (e.from === selectedNode.id || e.to === selectedNode.id);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = isHighlighted ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.1)';
      ctx.lineWidth = isHighlighted ? 2 : 1;
      ctx.stroke();
    });

    // Draw nodes
    nodes.forEach(n => {
      const isSelected = selectedNode?.id === n.id;
      const isRelated = selectedNode && edges.some(
        e => (e.from === selectedNode.id && e.to === n.id) || (e.to === selectedNode.id && e.from === n.id)
      );

      ctx.beginPath();
      ctx.arc(n.x, n.y, isSelected ? 12 : 8, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#000' : isRelated ? '#444' : '#999';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.fillStyle = isSelected ? '#000' : '#666';
      ctx.font = `${isSelected ? '600' : '400'} 11px "Noto Sans KR", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(n.profile.full_name, n.x, n.y + 22);
    });

    ctx.restore();
  }, [selectedNode]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clicked = nodesRef.current.find(n =>
      Math.hypot(n.x - x, n.y - y) < 14
    );

    if (clicked) {
      // Check if this node is a "related" node of currently selected
      if (selectedNode && clicked.profile.id !== selectedNode.id) {
        const isRelated = edgesRef.current.some(
          edge => (edge.from === selectedNode.id && edge.to === clicked.profile.id) ||
                  (edge.to === selectedNode.id && edge.from === clicked.profile.id)
        );
        if (!isRelated) {
          // Not related → show detail modal
          setDetailProfile(clicked.profile);
          return;
        }
      }

      setSelectedNode(clicked.profile);
      // Compute related
      const related = edgesRef.current
        .filter(edge => edge.from === clicked.profile.id || edge.to === clicked.profile.id)
        .map(edge => {
          const otherId = edge.from === clicked.profile.id ? edge.to : edge.from;
          const otherProfile = profiles.find(p => p.id === otherId);
          return otherProfile ? { profile: otherProfile, similarity: edge.weight } : null;
        })
        .filter(Boolean) as { profile: AlumniProfile; similarity: number }[];
      related.sort((a, b) => b.similarity - a.similarity);
      setRelatedAlumni(related);
    }
  };

  // Search handler: when name matches, select that node
  useEffect(() => {
    if (!searchName.trim()) {
      setSelectedNode(null);
      setRelatedAlumni([]);
      return;
    }
    const found = filteredProfiles.find(p =>
      p.full_name.toLowerCase().includes(searchName.toLowerCase()) ||
      (p.nickname || '').toLowerCase().includes(searchName.toLowerCase())
    );
    if (found) {
      setSelectedNode(found);
      const related = edgesRef.current
        .filter(edge => edge.from === found.id || edge.to === found.id)
        .map(edge => {
          const otherId = edge.from === found.id ? edge.to : edge.from;
          const otherProfile = profiles.find(p => p.id === otherId);
          return otherProfile ? { profile: otherProfile, similarity: edge.weight } : null;
        })
        .filter(Boolean) as { profile: AlumniProfile; similarity: number }[];
      related.sort((a, b) => b.similarity - a.similarity);
      setRelatedAlumni(related);
    }
  }, [searchName, filteredProfiles]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-foreground mb-6">네트워크 그래프</h1>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Controls */}
          <div className="lg:w-72 space-y-4 flex-shrink-0">
            <div>
              <Label className="text-sm font-semibold">이름 검색</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-10"
                  placeholder="이름 또는 닉네임..."
                  value={searchName}
                  onChange={e => setSearchName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold">기수 필터</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                <Button
                  variant={cohortFilter === '전체' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCohortFilter('전체')}
                  className="text-xs"
                >
                  전체
                </Button>
                {COHORTS.map(c => (
                  <Button
                    key={c}
                    variant={cohortFilter === c ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCohortFilter(c)}
                    className="text-xs"
                  >
                    {c}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold">유사도 임계값: {Math.round(threshold[0] * 100)}%</Label>
              <Slider
                value={threshold}
                onValueChange={setThreshold}
                min={0}
                max={1}
                step={0.05}
                className="mt-2"
              />
            </div>

            {/* Related alumni cards */}
            {selectedNode && (
              <div className="space-y-3 mt-4">
                <Card className="border border-border">
                  <CardContent className="p-3 flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={selectedNode.photo_url || ''} />
                      <AvatarFallback className="bg-accent text-accent-foreground text-sm">{selectedNode.full_name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{selectedNode.full_name}</p>
                      <Badge variant="secondary" className="text-xs">{selectedNode.cohort}</Badge>
                    </div>
                  </CardContent>
                </Card>

                {relatedAlumni.length > 0 && (
                  <>
                    <h4 className="text-sm font-semibold text-foreground">관련 동문</h4>
                    {relatedAlumni.map(r => (
                      <AlumniCard
                        key={r.profile.id}
                        profile={r.profile}
                        similarity={r.similarity}
                        onClick={() => setDetailProfile(r.profile)}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Canvas */}
          <div className="flex-1 border border-border rounded-lg bg-card overflow-hidden" style={{ minHeight: 500 }}>
            <canvas
              ref={canvasRef}
              className="w-full h-full cursor-pointer"
              style={{ minHeight: 500 }}
              onClick={handleCanvasClick}
            />
          </div>
        </div>
      </div>

      <ProfileDetailModal profile={detailProfile} open={!!detailProfile} onClose={() => setDetailProfile(null)} />
    </div>
  );
}
