-- Create a view to provide unified game stats with aggregated playtime
CREATE OR REPLACE VIEW public.v_games_with_stats AS
SELECT 
    g.id,
    g.display_title,
    g.cover_image_url,
    g.igdb_id,
    COALESCE(SUM(ps.playtime_minutes), 0)::INTEGER as total_playtime_minutes,
    MAX(ps.last_played_at) as last_played_at,
    ARRAY_AGG(DISTINCT pg.platform_name) as platforms
FROM 
    public.games g
LEFT JOIN 
    public.platform_games pg ON g.id = pg.game_id
LEFT JOIN 
    public.play_stats ps ON pg.id = ps.platform_game_id
GROUP BY 
    g.id, g.display_title, g.cover_image_url, g.igdb_id;

-- Grant access to the view
GRANT SELECT ON public.v_games_with_stats TO anon, authenticated, service_role;
