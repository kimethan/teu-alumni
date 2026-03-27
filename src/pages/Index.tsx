import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowRight, Users, Network, UserCircle } from 'lucide-react';

export default function Index() {
  const [heroTitle, setHeroTitle] = useState('TEU Alumni');
  const [heroContent, setHeroContent] = useState('TEU 동문 네트워크에 오신 것을 환영합니다');
  const [aboutContent, setAboutContent] = useState('');

  useEffect(() => {
    supabase.from('site_content').select('*').then(({ data }) => {
      if (data) {
        const hero = data.find(d => d.section_key === 'hero');
        const about = data.find(d => d.section_key === 'about');
        if (hero) { setHeroTitle(hero.title || ''); setHeroContent(hero.content || ''); }
        if (about) { setAboutContent(about.content || ''); }
      }
    });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      {/* Hero */}
      <section className="flex flex-col items-center justify-center py-32 px-4 border-b border-border">
        <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-foreground text-center">
          {heroTitle}
        </h1>
        <p className="mt-6 text-lg md:text-xl text-muted-foreground text-center max-w-xl">
          {heroContent}
        </p>
        <div className="flex gap-3 mt-10">
          <Link to="/directory">
            <Button size="lg" className="gap-2">
              동문 둘러보기 <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/login">
            <Button size="lg" variant="outline">로그인</Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto py-20 px-4">
        {aboutContent && (
          <p className="text-center text-muted-foreground mb-16 text-lg">{aboutContent}</p>
        )}
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { icon: Users, title: '동문 디렉토리', desc: '기수별로 동문을 검색하고 프로필을 확인하세요.' },
            { icon: Network, title: '네트워크 그래프', desc: '관심사와 역량 기반으로 동문 간 관계를 시각화합니다.' },
            { icon: UserCircle, title: '프로필 관리', desc: '접속 코드로 로그인하여 나만의 프로필을 관리하세요.' },
          ].map((f, i) => (
            <div key={i} className="border border-border rounded-lg p-6 hover:shadow-md transition-shadow">
              <f.icon className="h-8 w-8 text-foreground mb-4" />
              <h3 className="font-semibold text-foreground mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © 2024 TEU Alumni Network. All rights reserved.
      </footer>
    </div>
  );
}
