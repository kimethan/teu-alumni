# TEU Alumni Network

TEU 동문 네트워크 - Next.js + Supabase + Vercel

## 기술 스택

- **Frontend**: Next.js 15 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS 3 + shadcn/ui
- **Backend/DB**: Supabase (PostgreSQL + Auth + Storage + Realtime)
- **Hosting**: Vercel
- **상태 관리**: TanStack React Query

## 프로젝트 구조

```
src/
├── app/                    # Next.js App Router 페이지
│   ├── layout.tsx          # 루트 레이아웃
│   ├── page.tsx            # 홈페이지 (Index)
│   ├── not-found.tsx       # 404 페이지
│   ├── globals.css         # 글로벌 스타일
│   ├── login/page.tsx      # 로그인 (접근 코드)
│   ├── directory/page.tsx  # 동문 디렉토리
│   ├── network/page.tsx    # 네트워크 그래프
│   ├── profile/page.tsx    # 내 프로필
│   ├── messages/page.tsx   # DM 메시지
│   ├── admin/page.tsx      # 관리자 페이지
│   └── news/page.tsx       # 뉴스
├── components/
│   ├── ui/                 # shadcn/ui 컴포넌트
│   ├── Navbar.tsx          # 네비게이션 바
│   └── Providers.tsx       # 클라이언트 프로바이더
├── lib/
│   ├── utils.ts            # 유틸리티 (cn 함수)
│   ├── auth.tsx            # 인증 컨텍스트 (접근 코드 기반)
│   └── supabase/
│       ├── client.ts       # 브라우저용 Supabase 클라이언트
│       └── server.ts       # 서버용 Supabase 클라이언트
├── hooks/                  # 커스텀 훅
├── types/
│   └── supabase.ts         # DB 타입 정의
└── middleware.ts            # Supabase 세션 미들웨어
supabase/
└── migrations/             # DB 마이그레이션 SQL
```

## 세팅 방법

### 1. Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com) 에서 새 프로젝트 생성
2. 프로젝트 대시보드에서 **Project URL**과 **anon public key**를 복사
3. SQL Editor에서 `supabase/migrations/20260327012136_initial_schema.sql` 실행

### 2. 환경 변수 설정

```bash
cp .env.local.example .env.local
```

`.env.local` 파일을 열고 Supabase 값을 입력:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. 의존성 설치 및 실행

```bash
npm install
npm run dev
```

http://localhost:3000 에서 확인

### 4. shadcn/ui 컴포넌트 추가 (필요시)

```bash
npx shadcn@latest add dialog select tabs avatar separator
```

### 5. Vercel 배포

```bash
npm i -g vercel
vercel
```

또는 GitHub 레포 연결 후 Vercel 대시보드에서:
1. Import Git Repository
2. Environment Variables에 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 추가
3. Deploy

## DB 테이블 구조

| 테이블 | 설명 |
|---|---|
| `access_codes` | 동문 로그인용 접근 코드 |
| `alumni_profiles` | 동문 프로필 (이름, 기수, 회사, 관심사 등) |
| `messages` | 동문 간 DM 메시지 |
| `site_content` | 사이트 CMS 콘텐츠 |

## 원본 레포 (Lovable)

이 프로젝트는 [kimethan/teu-alumni](https://github.com/kimethan/teu-alumni) (Vite + React)를 
Next.js App Router 구조로 마이그레이션한 것입니다.
