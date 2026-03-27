import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { COHORTS } from '@/lib/constants';
import type { AlumniProfile } from '@/lib/constants';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { Upload } from 'lucide-react';

export default function Profile() {
  const { isLoggedIn, isAdmin, currentProfile, accessCode, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: '', nickname: '', cohort: 'TEU 1', company: '', title: '',
    interests: '', contribute: '', gain: '', sns: '', email: '', photo_url: '',
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoggedIn || isAdmin) { navigate('/login'); return; }
    if (currentProfile) {
      setForm({
        full_name: currentProfile.full_name || '',
        nickname: currentProfile.nickname || '',
        cohort: currentProfile.cohort || 'TEU 1',
        company: currentProfile.company || '',
        title: currentProfile.title || '',
        interests: currentProfile.interests || '',
        contribute: currentProfile.contribute || '',
        gain: currentProfile.gain || '',
        sns: currentProfile.sns || '',
        email: currentProfile.email || '',
        photo_url: currentProfile.photo_url || '',
      });
    }
  }, [isLoggedIn, isAdmin, currentProfile]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentProfile) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${currentProfile.id}.${ext}`;
    const { error } = await supabase.storage.from('profile-photos').upload(path, file, { upsert: true });
    if (error) {
      toast({ title: '업로드 실패', description: error.message, variant: 'destructive' });
    } else {
      const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(path);
      setForm(f => ({ ...f, photo_url: urlData.publicUrl }));
      toast({ title: '사진 업로드 완료' });
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!currentProfile) return;
    setSaving(true);
    const { data, error } = await supabase.from('alumni_profiles')
      .update(form)
      .eq('id', currentProfile.id)
      .select()
      .single();
    if (error) {
      toast({ title: '저장 실패', description: error.message, variant: 'destructive' });
    } else if (data) {
      login(accessCode!, data as AlumniProfile);
      toast({ title: '프로필이 저장되었습니다' });
    }
    setSaving(false);
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold">내 프로필</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Photo */}
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={form.photo_url} />
                <AvatarFallback className="bg-accent text-accent-foreground text-xl">
                  {form.full_name?.charAt(0) || '?'}
                </AvatarFallback>
              </Avatar>
              <div>
                <Label htmlFor="photo" className="cursor-pointer">
                  <div className="flex items-center gap-2 text-sm text-foreground border border-border rounded-md px-3 py-2 hover:bg-accent transition-colors">
                    <Upload className="h-4 w-4" />
                    {uploading ? '업로드 중...' : '사진 변경'}
                  </div>
                </Label>
                <input id="photo" type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>이름 *</Label>
                <Input value={form.full_name} onChange={set('full_name')} placeholder="홍길동" />
              </div>
              <div>
                <Label>닉네임</Label>
                <Input value={form.nickname} onChange={set('nickname')} placeholder="닉네임" />
              </div>
            </div>

            <div>
              <Label>기수 *</Label>
              <Select value={form.cohort} onValueChange={v => setForm(f => ({ ...f, cohort: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COHORTS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>직장 / 회사</Label>
                <Input value={form.company} onChange={set('company')} placeholder="회사명" />
              </div>
              <div>
                <Label>직함 / 역할</Label>
                <Input value={form.title} onChange={set('title')} placeholder="직함" />
              </div>
            </div>

            <div>
              <Label>관심사</Label>
              <Textarea value={form.interests} onChange={set('interests')} placeholder="관심 분야를 입력하세요" rows={3} />
            </div>
            <div>
              <Label>커뮤니티에 기여할 수 있는 것</Label>
              <Textarea value={form.contribute} onChange={set('contribute')} placeholder="기여할 수 있는 것을 적어주세요" rows={3} />
            </div>
            <div>
              <Label>커뮤니티에서 얻고 싶은 것</Label>
              <Textarea value={form.gain} onChange={set('gain')} placeholder="얻고 싶은 것을 적어주세요" rows={3} />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>이메일</Label>
                <Input type="email" value={form.email} onChange={set('email')} placeholder="email@example.com" />
              </div>
              <div>
                <Label>SNS</Label>
                <Input value={form.sns} onChange={set('sns')} placeholder="Instagram, LinkedIn 등" />
              </div>
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : '프로필 저장'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
