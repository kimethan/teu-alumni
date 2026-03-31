
-- Allow deleting access codes
CREATE POLICY "Anyone can delete access codes"
ON public.access_codes
FOR DELETE
USING (true);

-- Allow deleting alumni profiles
CREATE POLICY "Anyone can delete alumni profiles"
ON public.alumni_profiles
FOR DELETE
USING (true);
