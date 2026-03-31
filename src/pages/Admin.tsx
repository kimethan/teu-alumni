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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { Download, RefreshCw, Edit2, Save, Plus, Trash2, KeyRound } from 'lucide-react';
import CsvUpload from '@/components/admin/CsvUpload';

function generateCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

export default function Admin() {
  const { isLoggedIn, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<AlumniProfile[]>([]);
  const [codes, setCodes] = useState<{ id: string; code: string; alumni_name: string | null; is_used: boolean; created_at: string }[]>([]);
  const [newCodeName, setNewCodeName] = useState('');
  const [editProfile, setEditProfile] = useState<AlumniProfile | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [siteContent, setSiteContent] = useState<{ id: string; section_key: string; title: string | null; content: string | null; image_url: string | null }[]>([]);

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) { navigate('/login'); return; }
    loadData();
  }, [isLoggedIn, isAdmin]);

  const loadData = async () => {
    const [{ data: p }, { data: c }, { data: s }] = await Promise.all([
      supabase.from('alumni_profiles').select('*').order('full_name'),
      supabase.from('access_codes').select('*').order('created_at', { ascending: false }),
      supabase.from('site_content').select('*'),
    ]);
    if (p) setProfiles(p as AlumniProfile[]);
    if (c) setCodes(c as any[]);
    if (s) setSiteContent(s as any[]);
  };

  const generateUniqueCode = async (): Promise<string> => {
    const { data: existingCodes } = await supabase.from('access_codes').select('code');
    const usedCodes = new Set((existingCodes || []).map(c => c.code));
    let code = generateCode();
    let attempts = 0;
    while (usedCodes.has(code) && attempts < 100) { code = generateCode(); attempts++; }
    return code;
  };

  const handleGenerateCode = async () => {
    const code = await generateUniqueCode();
    const { error } = await supabase.from('access_codes').insert({
      code,
      alumni_name: newCodeName.trim() || null,
    });
    if (error) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '코드 생성 완료', description: code });
      setNewCodeName('');
      loadData();
    }
  };

  const handleDeleteCode = async (codeEntry: typeof codes[0]) => {
    // Delete associated profile first
    if (codeEntry.is_used) {
      await supabase.from('alumni_profiles').delete().eq('access_code', codeEntry.code);
    }
    const { error } = await supabase.from('access_codes').delete().eq('id', codeEntry.id);
    if (error) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '코드 삭제 완료' });
      loadData();
    }
  };

  const handleReissueCode = async (codeEntry: typeof codes[0]) => {
    const newCode = await generateUniqueCode();
    // Update access_codes table
    const { error: codeErr } = await supabase.from('access_codes').update({ code: newCode, is_used: false }).eq('id', codeEntry.id);
    if (codeErr) {
      toast({ title: '오류', description: codeErr.message, variant: 'destructive' });
      return;
    }
    // Update linked profile if exists
    await supabase.from('alumni_profiles').update({ access_code: newCode }).eq('access_code', codeEntry.code);
    toast({ title: '코드 재발행 완료', description: newCode });
    loadData();
  };

  const [showNewProfile, setShowNewProfile] = useState(false);
  const [newProfileForm, setNewProfileForm] = useState({
    full_name: '', nickname: '', cohort: 'TEU 1', company: '', title: '',
    interests: '', contribute: '', gain: '', sns: '', email: '',
  });

  const handleCreateProfile = async () => {
    if (!newProfileForm.full_name.trim()) {
      toast({ title: '오류', description: '이름을 입력해주세요.', variant: 'destructive' });
      return;
    }
    const code = await generateUniqueCode();
    const { error: codeErr } = await supabase.from('access_codes').insert({ code, alumni_name: newProfileForm.full_name });
    if (codeErr) { toast({ title: '오류', description: codeErr.message, variant: 'destructive' }); return; }
    const { error: profileErr } = await supabase.from('alumni_profiles').insert({ ...newProfileForm, access_code: code });
    if (profileErr) { toast({ title: '오류', description: profileErr.message, variant: 'destructive' }); return; }
    toast({ title: '프로필 생성 완료', description: `접속코드: ${code}` });
    setNewProfileForm({ full_name: '', nickname: '', cohort: 'TEU 1', company: '', title: '', interests: '', contribute: '', gain: '', sns: '', email: '' });
    setShowNewProfile(false);
    loadData();
  };

  const openEditProfile = (p: AlumniProfile) => {
    setEditProfile(p);
    setEditForm({
      full_name: p.full_name || '',
      nickname: p.nickname || '',
      cohort: p.cohort || 'TEU 1',
      company: p.company || '',
      title: p.title || '',
      interests: p.interests || '',
      contribute: p.contribute || '',
      gain: p.gain || '',
      sns: p.sns || '',
      email: p.email || '',
    });
  };

  const saveEditProfile = async () => {
    if (!editProfile) return;
    const { error } = await supabase.from('alumni_profiles').update(editForm).eq('id', editProfile.id);
    if (error) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '프로필 수정 완료' });
      setEditProfile(null);
      loadData();
    }
  };

  const downloadExcel = () => {
    const headers = ['이름', '닉네임', '기수', '직장/회사', '직함', '관심사', '기여', '기대', 'SNS', '이메일', '접속코드'];
    const rows = profiles.map(p => [
      p.full_name, p.nickname, p.cohort, p.company, p.title,
      p.interests, p.contribute, p.gain, p.sns, p.email, p.access_code,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${(v || '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teu_alumni_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveSiteContent = async (item: typeof siteContent[0]) => {
    const { error } = await supabase.from('site_content').update({
      title: item.title,
      content: item.content,
      image_url: item.image_url,
    }).eq('id', item.id);
    if (error) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '콘텐츠 저장 완료' });
    }
  };

  const updateSiteItem = (id: string, field: string, value: string) => {
    setSiteContent(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-foreground mb-6">관리자 대시보드</h1>

        <Tabs defaultValue="profiles">
          <TabsList>
            <TabsTrigger value="profiles">동문 프로필</TabsTrigger>
            <TabsTrigger value="codes">접속 코드</TabsTrigger>
            <TabsTrigger value="cms">콘텐츠 편집</TabsTrigger>
          </TabsList>

          {/* Profiles Tab */}
          <TabsContent value="profiles" className="mt-6">
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-muted-foreground">총 {profiles.length}명</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowNewProfile(true)}>
                  <Plus className="h-4 w-4 mr-2" /> 새 프로필 생성
                </Button>
                <Button variant="outline" onClick={downloadExcel}>
                  <Download className="h-4 w-4 mr-2" /> 엑셀 다운로드
                </Button>
              </div>
            </div>
            <div className="border border-border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>이름</TableHead>
                    <TableHead>기수</TableHead>
                    <TableHead>직장</TableHead>
                    <TableHead>직함</TableHead>
                    <TableHead>접속코드</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.full_name}</TableCell>
                      <TableCell><Badge variant="secondary">{p.cohort}</Badge></TableCell>
                      <TableCell>{p.company}</TableCell>
                      <TableCell>{p.title}</TableCell>
                      <TableCell className="font-mono text-xs">{p.access_code}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => openEditProfile(p)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Access Codes Tab */}
          <TabsContent value="codes" className="mt-6 space-y-6">
            <CsvUpload onComplete={loadData} />
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">접속 코드 생성</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-3 items-end">
                <div className="flex-1">
                  <Label>동문 이름 (선택)</Label>
                  <Input value={newCodeName} onChange={e => setNewCodeName(e.target.value)} placeholder="홍길동" />
                </div>
                <Button onClick={handleGenerateCode}>
                  <Plus className="h-4 w-4 mr-2" /> 코드 생성
                </Button>
              </CardContent>
            </Card>

            <div className="border border-border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>동문 이름</TableHead>
                    <TableHead>접속 코드</TableHead>
                    <TableHead>사용 여부</TableHead>
                    <TableHead>생성일</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map(c => (
                    <TableRow key={c.id}>
                      <TableCell>{c.alumni_name || '-'}</TableCell>
                      <TableCell className="font-mono text-sm">{c.code}</TableCell>
                      <TableCell>
                        <Badge variant={c.is_used ? 'default' : 'outline'}>
                          {c.is_used ? '사용됨' : '미사용'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString('ko-KR')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* CMS Tab */}
          <TabsContent value="cms" className="mt-6 space-y-6">
            {siteContent.map(item => (
              <Card key={item.id}>
                <CardHeader>
                  <CardTitle className="text-lg">섹션: {item.section_key}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>제목</Label>
                    <Input
                      value={item.title || ''}
                      onChange={e => updateSiteItem(item.id, 'title', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>내용</Label>
                    <Textarea
                      value={item.content || ''}
                      onChange={e => updateSiteItem(item.id, 'content', e.target.value)}
                      rows={4}
                    />
                  </div>
                  <div>
                    <Label>이미지 URL</Label>
                    <Input
                      value={item.image_url || ''}
                      onChange={e => updateSiteItem(item.id, 'image_url', e.target.value)}
                    />
                  </div>
                  <Button onClick={() => saveSiteContent(item)}>
                    <Save className="h-4 w-4 mr-2" /> 저장
                  </Button>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Profile Modal */}
      <Dialog open={!!editProfile} onOpenChange={() => setEditProfile(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>프로필 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>이름</Label>
                <Input value={editForm.full_name || ''} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div>
                <Label>닉네임</Label>
                <Input value={editForm.nickname || ''} onChange={e => setEditForm(f => ({ ...f, nickname: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>기수</Label>
              <Select value={editForm.cohort} onValueChange={v => setEditForm(f => ({ ...f, cohort: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COHORTS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>직장</Label>
                <Input value={editForm.company || ''} onChange={e => setEditForm(f => ({ ...f, company: e.target.value }))} />
              </div>
              <div>
                <Label>직함</Label>
                <Input value={editForm.title || ''} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>관심사</Label>
              <Textarea value={editForm.interests || ''} onChange={e => setEditForm(f => ({ ...f, interests: e.target.value }))} rows={2} />
            </div>
            <div>
              <Label>기여</Label>
              <Textarea value={editForm.contribute || ''} onChange={e => setEditForm(f => ({ ...f, contribute: e.target.value }))} rows={2} />
            </div>
            <div>
              <Label>기대</Label>
              <Textarea value={editForm.gain || ''} onChange={e => setEditForm(f => ({ ...f, gain: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>이메일</Label>
                <Input value={editForm.email || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <Label>SNS</Label>
                <Input value={editForm.sns || ''} onChange={e => setEditForm(f => ({ ...f, sns: e.target.value }))} />
              </div>
            </div>
            <Button className="w-full" onClick={saveEditProfile}>
              <Save className="h-4 w-4 mr-2" /> 저장
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
