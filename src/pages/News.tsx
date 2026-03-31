import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import Navbar from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, Search, RefreshCw, Newspaper } from 'lucide-react';
import type { AlumniProfile } from '@/lib/constants';

type NewsItem = {
  title: string;
  link: string;
  source: string;
  snippet: string;
  alumni_name: string;
  company: string;
};

export default function News() {
  const [profiles, setProfiles] = useState<AlumniProfile[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    supabase.from('alumni_profiles').select('*').order('full_name')
      .then(({ data }) => { if (data) setProfiles(data as AlumniProfile[]); });
  }, []);

  const searchNews = async (query?: string) => {
    setLoading(true);
    setSearched(true);
    try {
      const targetProfiles = query
        ? profiles.filter(p =>
            p.full_name.includes(query) || (p.company && p.company.includes(query))
          )
        : profiles.filter(p => p.company);

      if (targetProfiles.length === 0) {
        setNews([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('search-alumni-news', {
        body: { profiles: targetProfiles.slice(0, 10).map(p => ({ full_name: p.full_name, company: p.company || '' })) },
      });

      if (error) throw error;
      setNews(data?.results || []);
    } catch (err) {
      console.error('News search error:', err);
      setNews([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Newspaper className="h-8 w-8 text-foreground" />
          <h1 className="text-3xl font-bold text-foreground">동문 뉴스</h1>
        </div>

        <p className="text-muted-foreground mb-6">
          동문의 회사명과 이름이 언급된 뉴스를 검색합니다.
        </p>

        <div className="flex gap-3 mb-8">
          <Input
            placeholder="동문 이름 또는 회사명으로 검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchNews(searchQuery)}
            className="flex-1"
          />
          <Button onClick={() => searchNews(searchQuery)}>
            <Search className="h-4 w-4 mr-2" /> 검색
          </Button>
          <Button variant="outline" onClick={() => searchNews()}>
            <RefreshCw className="h-4 w-4 mr-2" /> 전체
          </Button>
        </div>

        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardContent className="p-6 space-y-3">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && searched && news.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              검색 결과가 없습니다. 다른 검색어를 시도해보세요.
            </CardContent>
          </Card>
        )}

        {!loading && news.length > 0 && (
          <div className="space-y-4">
            {news.map((item, i) => (
              <Card key={i} className="hover:border-foreground/30 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-lg font-semibold text-foreground hover:underline inline-flex items-center gap-2"
                      >
                        {item.title}
                        <ExternalLink className="h-4 w-4 flex-shrink-0" />
                      </a>
                      <p className="text-sm text-muted-foreground">{item.snippet}</p>
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="outline">{item.source}</Badge>
                        <Badge variant="secondary">{item.alumni_name}</Badge>
                        {item.company && <Badge variant="secondary">{item.company}</Badge>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!searched && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              검색 버튼을 눌러 동문 관련 뉴스를 확인하세요.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
