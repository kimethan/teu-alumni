import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AlumniProfile } from '@/lib/constants';
import { COHORTS } from '@/lib/constants';
import Navbar from '@/components/Navbar';
import AlumniCard from '@/components/AlumniCard';
import ProfileDetailModal from '@/components/ProfileDetailModal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

export default function Directory() {
  const [profiles, setProfiles] = useState<AlumniProfile[]>([]);
  const [filter, setFilter] = useState('전체');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AlumniProfile | null>(null);

  useEffect(() => {
    supabase.from('alumni_profiles').select('*').order('cohort').then(({ data }) => {
      if (data) setProfiles(data as AlumniProfile[]);
    });
  }, []);

  const filtered = profiles.filter(p => {
    const matchCohort = filter === '전체' || p.cohort === filter;
    const matchSearch = !search || p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (p.nickname || '').toLowerCase().includes(search.toLowerCase());
    return matchCohort && matchSearch;
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-foreground mb-6">동문 디렉토리</h1>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="이름 또는 닉네임으로 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Cohort filter */}
        <div className="flex flex-wrap gap-2 mb-8">
          <Button
            variant={filter === '전체' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('전체')}
          >
            전체
          </Button>
          {COHORTS.map(c => (
            <Button
              key={c}
              variant={filter === c ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(c)}
            >
              {c}
            </Button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => (
            <AlumniCard key={p.id} profile={p} onClick={() => setSelected(p)} />
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-12">해당하는 동문이 없습니다.</p>
        )}
      </div>

      <ProfileDetailModal profile={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}
