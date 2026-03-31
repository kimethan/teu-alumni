import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { COHORTS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Download, Upload, FileText } from 'lucide-react';

function generateCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

async function generateUniqueCode(): Promise<string> {
  const { data: existing } = await supabase.from('access_codes').select('code');
  const existingCodes = new Set((existing || []).map(c => c.code));
  
  let code = generateCode();
  let attempts = 0;
  while (existingCodes.has(code) && attempts < 100) {
    code = generateCode();
    attempts++;
  }
  return code;
}

type CsvRow = {
  full_name: string;
  nickname?: string;
  cohort?: string;
  company?: string;
  title?: string;
  interests?: string;
  contribute?: string;
  gain?: string;
  sns?: string;
  email?: string;
};

export default function CsvUpload({ onComplete }: { onComplete: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<CsvRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadSample = () => {
    const headers = ['full_name', 'nickname', 'cohort', 'company', 'title', 'interests', 'contribute', 'gain', 'sns', 'email'];
    const sample = [
      ['홍길동', '길동이', 'TEU 1', '테크회사', 'CTO', 'AI, 블록체인', '기술 멘토링', '네트워킹', 'instagram.com/gildong', 'gildong@example.com'],
      ['김영희', '영희', 'TEU 2', '스타트업', 'CEO', '스타트업, 투자', '투자 연결', '기술 인사이트', '', 'younghee@example.com'],
    ];
    const bom = '\uFEFF';
    const csv = [headers.join(','), ...sample.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'teu_alumni_sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCsv = (text: string): CsvRow[] => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
    const nameIdx = headers.indexOf('full_name');
    if (nameIdx === -1) return [];

    return lines.slice(1).map(line => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const ch of line) {
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue; }
        current += ch;
      }
      values.push(current.trim());

      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] || ''; });
      return row as unknown as CsvRow;
    }).filter(r => r.full_name);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      if (rows.length === 0) {
        toast({ title: '오류', description: 'CSV 파일에 유효한 데이터가 없습니다. full_name 열이 필요합니다.', variant: 'destructive' });
        return;
      }
      setPreview(rows);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleUpload = async () => {
    if (preview.length === 0) return;
    setUploading(true);

    try {
      const { data: existingCodes } = await supabase.from('access_codes').select('code');
      const usedCodes = new Set((existingCodes || []).map(c => c.code));

      let successCount = 0;
      let errorCount = 0;

      for (const row of preview) {
        let code = generateCode();
        let attempts = 0;
        while (usedCodes.has(code) && attempts < 100) {
          code = generateCode();
          attempts++;
        }
        usedCodes.add(code);

        const cohort = row.cohort && COHORTS.includes(row.cohort as any) ? row.cohort : 'TEU 1';

        const { error: codeErr } = await supabase.from('access_codes').insert({
          code,
          alumni_name: row.full_name,
        });

        if (codeErr) { errorCount++; continue; }

        const { error: profileErr } = await supabase.from('alumni_profiles').insert({
          full_name: row.full_name,
          nickname: row.nickname || '',
          cohort,
          company: row.company || '',
          title: row.title || '',
          interests: row.interests || '',
          contribute: row.contribute || '',
          gain: row.gain || '',
          sns: row.sns || '',
          email: row.email || '',
          access_code: code,
        });

        if (profileErr) { errorCount++; } else { successCount++; }
      }

      toast({
        title: '업로드 완료',
        description: `${successCount}명 성공, ${errorCount}명 실패`,
      });
      setPreview([]);
      if (fileRef.current) fileRef.current.value = '';
      onComplete();
    } catch (err) {
      toast({ title: '오류', description: '업로드 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">CSV 일괄 업로드</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3">
          <Button variant="outline" onClick={downloadSample}>
            <Download className="h-4 w-4 mr-2" /> 샘플 CSV 다운로드
          </Button>
          <div>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" id="csv-upload" />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <FileText className="h-4 w-4 mr-2" /> CSV 파일 선택
            </Button>
          </div>
        </div>

        {preview.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{preview.length}명의 프로필이 발견되었습니다.</p>
            <div className="border border-border rounded-lg overflow-x-auto max-h-60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-3 py-2 text-left">이름</th>
                    <th className="px-3 py-2 text-left">닉네임</th>
                    <th className="px-3 py-2 text-left">기수</th>
                    <th className="px-3 py-2 text-left">회사</th>
                    <th className="px-3 py-2 text-left">이메일</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="px-3 py-2">{r.full_name}</td>
                      <td className="px-3 py-2">{r.nickname || '-'}</td>
                      <td className="px-3 py-2">{r.cohort || 'TEU 1'}</td>
                      <td className="px-3 py-2">{r.company || '-'}</td>
                      <td className="px-3 py-2">{r.email || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button onClick={handleUpload} disabled={uploading}>
              <Upload className="h-4 w-4 mr-2" /> {uploading ? '업로드 중...' : `${preview.length}명 일괄 등록`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
