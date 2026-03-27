import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';

export default function Login() {
  const [code, setCode] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPw, setAdminPw] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, adminLogin } = useAuth();
  const navigate = useNavigate();

  const handleCodeLogin = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const { data: ac } = await supabase.from('access_codes').select('*').eq('code', code.trim()).single();
      if (!ac) {
        toast({ title: '오류', description: '유효하지 않은 접속 코드입니다.', variant: 'destructive' });
        setLoading(false);
        return;
      }
      // Find or create profile
      let { data: profile } = await supabase.from('alumni_profiles').select('*').eq('access_code', code.trim()).single();
      if (!profile) {
        const { data: newProfile } = await supabase.from('alumni_profiles').insert({
          access_code: code.trim(),
          full_name: ac.alumni_name || '',
          cohort: 'TEU 1',
        }).select().single();
        profile = newProfile;
        // Mark code as used
        await supabase.from('access_codes').update({ is_used: true }).eq('code', code.trim());
      }
      if (profile) {
        login(code.trim(), profile as any);
        toast({ title: '로그인 성공', description: '환영합니다!' });
        navigate('/profile');
      }
    } catch {
      toast({ title: '오류', description: '로그인 중 문제가 발생했습니다.', variant: 'destructive' });
    }
    setLoading(false);
  };

  const handleAdminLogin = () => {
    if (adminLogin(adminEmail, adminPw)) {
      toast({ title: '관리자 로그인 성공' });
      navigate('/admin');
    } else {
      toast({ title: '오류', description: '관리자 정보가 올바르지 않습니다.', variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="flex items-center justify-center py-20 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">로그인</CardTitle>
            <CardDescription>접속 코드 또는 관리자 계정으로 로그인하세요</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="alumni">
              <TabsList className="w-full">
                <TabsTrigger value="alumni" className="flex-1">동문 로그인</TabsTrigger>
                <TabsTrigger value="admin" className="flex-1">관리자 로그인</TabsTrigger>
              </TabsList>
              <TabsContent value="alumni" className="space-y-4 mt-4">
                <div>
                  <Label>접속 코드</Label>
                  <Input
                    placeholder="xxxx-xxxx-xxxx-xxxx"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCodeLogin()}
                  />
                </div>
                <Button className="w-full" onClick={handleCodeLogin} disabled={loading}>
                  {loading ? '로그인 중...' : '로그인'}
                </Button>
              </TabsContent>
              <TabsContent value="admin" className="space-y-4 mt-4">
                <div>
                  <Label>이메일</Label>
                  <Input
                    type="email"
                    placeholder="관리자 이메일"
                    value={adminEmail}
                    onChange={e => setAdminEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label>비밀번호</Label>
                  <Input
                    type="password"
                    placeholder="비밀번호"
                    value={adminPw}
                    onChange={e => setAdminPw(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdminLogin()}
                  />
                </div>
                <Button className="w-full" onClick={handleAdminLogin}>로그인</Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
