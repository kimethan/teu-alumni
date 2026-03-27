
-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Access codes table
CREATE TABLE public.access_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  alumni_name TEXT,
  is_used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can check access codes" ON public.access_codes
  FOR SELECT USING (true);

CREATE POLICY "Only authenticated can update access codes" ON public.access_codes
  FOR UPDATE USING (true);

CREATE POLICY "Only authenticated can insert access codes" ON public.access_codes
  FOR INSERT WITH CHECK (true);

-- Alumni profiles table
CREATE TABLE public.alumni_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  access_code TEXT REFERENCES public.access_codes(code),
  full_name TEXT NOT NULL DEFAULT '',
  nickname TEXT DEFAULT '',
  cohort TEXT NOT NULL DEFAULT 'TEU 1',
  company TEXT DEFAULT '',
  title TEXT DEFAULT '',
  interests TEXT DEFAULT '',
  contribute TEXT DEFAULT '',
  gain TEXT DEFAULT '',
  sns TEXT DEFAULT '',
  email TEXT DEFAULT '',
  photo_url TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.alumni_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view alumni profiles" ON public.alumni_profiles
  FOR SELECT USING (true);

CREATE POLICY "Alumni can update own profile" ON public.alumni_profiles
  FOR UPDATE USING (true);

CREATE POLICY "Anyone can insert alumni profiles" ON public.alumni_profiles
  FOR INSERT WITH CHECK (true);

CREATE TRIGGER update_alumni_profiles_updated_at
  BEFORE UPDATE ON public.alumni_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Messages table for real-time DM
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view messages" ON public.messages
  FOR SELECT USING (true);

CREATE POLICY "Anyone can send messages" ON public.messages
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update messages" ON public.messages
  FOR UPDATE USING (true);

-- Site content CMS table
CREATE TABLE public.site_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_key TEXT NOT NULL UNIQUE,
  title TEXT DEFAULT '',
  content TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view site content" ON public.site_content
  FOR SELECT USING (true);

CREATE POLICY "Anyone can update site content" ON public.site_content
  FOR UPDATE USING (true);

CREATE POLICY "Anyone can insert site content" ON public.site_content
  FOR INSERT WITH CHECK (true);

CREATE TRIGGER update_site_content_updated_at
  BEFORE UPDATE ON public.site_content
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for profile photos
INSERT INTO storage.buckets (id, name, public) VALUES ('profile-photos', 'profile-photos', true);

CREATE POLICY "Anyone can view profile photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'profile-photos');

CREATE POLICY "Anyone can upload profile photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'profile-photos');

CREATE POLICY "Anyone can update profile photos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'profile-photos');

CREATE POLICY "Anyone can delete profile photos" ON storage.objects
  FOR DELETE USING (bucket_id = 'profile-photos');

-- Insert default site content
INSERT INTO public.site_content (section_key, title, content) VALUES
  ('hero', 'TEU Alumni', 'TEU 동문 네트워크에 오신 것을 환영합니다'),
  ('about', '소개', 'TEU Alumni Network는 TEU 동문들의 연결과 성장을 위한 커뮤니티입니다.'),
  ('footer', '하단', '© 2024 TEU Alumni Network. All rights reserved.');
