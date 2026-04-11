-- Enable RLS
ALTER TABLE public.play_stats ENABLE ROW LEVEL SECURITY;

-- Create public read policy
CREATE POLICY "Allow public read access on play_stats" ON public.play_stats FOR SELECT USING (true);
