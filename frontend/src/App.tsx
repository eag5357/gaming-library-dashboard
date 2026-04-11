import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import './App.css';
import { LayoutGrid, RefreshCw, Clock, Search, Filter, Trophy, Gamepad2, Timer } from 'lucide-react';

interface Game {
  id: string;
  display_title: string;
  cover_image_url: string;
  platforms: string[];
  playtime_minutes: number;
  last_played_at: string | null;
}

type SortOption = 'alphabetical' | 'most-played' | 'most-recent';

function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('most-played');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGames();
  }, []);

  async function fetchGames() {
    setLoading(true);
    const { data, error } = await supabase
      .from('games')
      .select(`
        *,
        platform_games (
          platform_name,
          play_stats (
            playtime_minutes,
            last_played_at
          )
        )
      `);

    if (error) {
      console.error('Error fetching games:', error);
    } else {
      const formattedGames = data?.map(g => {
        // Collect all platforms and aggregate playtime
        const platforms = g.platform_games?.map((pg: any) => pg.platform_name) || [];
        const totalMinutes = g.platform_games?.reduce((acc: number, pg: any) => {
          return acc + (pg.play_stats?.[0]?.playtime_minutes || 0);
        }, 0) || 0;
        
        // Find most recent play date
        const dates = g.platform_games
          ?.map((pg: any) => pg.play_stats?.[0]?.last_played_at)
          .filter(Boolean)
          .map((d: string) => new Date(d).getTime());
        const lastPlayed = dates?.length ? new Date(Math.max(...dates)).toISOString() : null;

        return {
          ...g,
          platforms,
          playtime_minutes: totalMinutes,
          last_played_at: lastPlayed
        };
      }) || [];
      setGames(formattedGames);
    }
    setLoading(false);
  }

  const formatPlaytime = (minutes: number) => {
    if (minutes === 0) return 'Never played';
    const hours = Math.round(minutes / 60);
    return hours === 0 ? '< 1 hour' : `${hours.toLocaleString()}h`;
  };

  const sortedAndFilteredGames = games
    .filter(game => 
      game.display_title.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'alphabetical') {
        return a.display_title.localeCompare(b.display_title);
      } else if (sortBy === 'most-played') {
        return b.playtime_minutes - a.playtime_minutes;
      } else if (sortBy === 'most-recent') {
        const dateA = a.last_played_at ? new Date(a.last_played_at).getTime() : 0;
        const dateB = b.last_played_at ? new Date(b.last_played_at).getTime() : 0;
        return dateB - dateA;
      }
      return 0;
    });

  return (
    <div className="dashboard">
      <header className="header">
        <h1><LayoutGrid size={28} style={{marginRight: '10px', verticalAlign: 'middle'}} /> Gaming Dashboard</h1>
        <button onClick={fetchGames} style={{background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)'}}>
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-label"><Gamepad2 size={14} style={{marginRight: '5px', verticalAlign: 'text-bottom'}} /> Total Library</div>
          <div className="stat-value">{games.length} Games</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><Timer size={14} style={{marginRight: '5px', verticalAlign: 'text-bottom'}} /> Total Playtime</div>
          <div className="stat-value">{Math.round(games.reduce((a,b) => a + b.playtime_minutes, 0) / 60).toLocaleString()} Hours</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><Trophy size={14} style={{marginRight: '5px', verticalAlign: 'text-bottom'}} /> Most Played</div>
          <div className="stat-value" style={{fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
            {games.sort((a, b) => b.playtime_minutes - a.playtime_minutes)[0]?.display_title || 'N/A'}
          </div>
        </div>
      </section>

      <div className="controls-row">
        <div className="search-container" style={{marginBottom: 0}}>
          <Search className="search-icon" size={18} />
          <input 
            type="text" 
            placeholder="Search your unified library..." 
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div style={{position: 'relative', display: 'flex', alignItems: 'center'}}>
          <Filter size={18} style={{position: 'absolute', left: '0.75rem', color: 'var(--text-secondary)', pointerEvents: 'none'}} />
          <select 
            className="sort-select" 
            style={{paddingLeft: '2.5rem'}}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
          >
            <option value="most-played">Most Played</option>
            <option value="most-recent">Most Recent</option>
            <option value="alphabetical">Alphabetical</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading">Updating Stats...</div>
      ) : (
        <div className="game-grid">
          {sortedAndFilteredGames.map((game) => (
            <div key={game.id} className="game-card">
              <div className="cover-wrapper">
                <img 
                  src={game.cover_image_url || 'https://via.placeholder.com/300x400?text=No+Cover'} 
                  alt={game.display_title}
                  className="cover-image"
                  loading="lazy"
                />
              </div>
              <div className="game-info">
                <h3 className="game-title" title={game.display_title}>{game.display_title}</h3>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <div style={{display: 'flex', gap: '4px'}}>
                    {game.platforms.map(p => (
                      <span key={p} className="platform-badge" style={{
                        backgroundColor: p === 'XBOX' ? '#107c10' : p === 'STEAM' ? '#171a21' : 'var(--accent)',
                        fontSize: '0.65rem'
                      }}>{p}</span>
                    ))}
                  </div>
                  <div style={{display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)', fontSize: '0.8rem'}}>
                    <Clock size={12} />
                    <span>{formatPlaytime(game.playtime_minutes)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
