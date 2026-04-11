-- Enable RLS
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_games ENABLE ROW LEVEL SECURITY;

-- Create public read policies
CREATE POLICY "Allow public read access on games" ON public.games FOR SELECT USING (true);
CREATE POLICY "Allow public read access on platform_games" ON public.platform_games FOR SELECT USING (true);
