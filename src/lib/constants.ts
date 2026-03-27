export const COHORTS = [
  'TEU 1', 'TEU 2', 'TEU 3', 'TEU 4', 'TEU 5', 'TEU 6',
  'TEU ART 1', 'TEU ART 2', 'TEU ART 3',
  'TEU MED 1', 'TEU MED 2', 'TEU MED 3', 'TEU MED 4', 'TEU MED 5',
] as const;

export const ADMIN_EMAIL = 'info@te.university';
export const ADMIN_PASSWORD = 'teuteu1919';

export type AlumniProfile = {
  id: string;
  access_code: string | null;
  full_name: string;
  nickname: string | null;
  cohort: string;
  company: string | null;
  title: string | null;
  interests: string | null;
  contribute: string | null;
  gain: string | null;
  sns: string | null;
  email: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
};
