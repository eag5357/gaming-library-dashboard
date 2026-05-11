import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import './App.css';
import { LayoutGrid, RefreshCw, Clock, Search, Filter, Trophy, Gamepad2, Timer, LogOut, User, Settings } from 'lucide-react';
import { Auth } from './components/Auth';
import { AccountSettings } from './components/AccountSettings';
import type { Session } from '@supabase/supabase-js';

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
  const [session, setSession] = useState<Session | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('most-played');
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
      } catch (err: any) {
        console.error("Auth initialization error:", err);
        setError("Failed to initialize authentication.");
      } finally {
        setInitialLoading(false);
      }
    };

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setInitialLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      fetchGames();
    }
  }, [session]);

  async function fetchGames() {
    if (!session) return;
    setLoading(true);
    
    const { data, error } = await supabase
      .from('v_games_with_stats')
      .select('*')
      .eq('user_id', session.user.id)
      .order('display_title');

    if (error) {
      console.error('Error fetching games:', error);
    } else {
      const formattedGames = data?.map(g => ({
        ...g,
        platforms: (g.platforms || []).filter(Boolean),
        playtime_minutes: g.total_playtime_minutes || 0
      })) || [];
      setGames(formattedGames);
    }
    setLoading(false);
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setGames([]);
  };

  if (error) {
    return <div className="loading" style={{color: '#e60012'}}>{error}</div>;
  }

  if (initialLoading) {
    return <div className="loading">Initializing Session...</div>;
  }

  if (!session) {
    return <Auth />;
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
        <div style={{display: 'flex', alignItems: 'center', gap: '1.5rem'}}>
          <button onClick={fetchGames} style={{background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)'}}>
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowSettings(true)} style={{background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)'}}>
            <Settings size={20} />
          </button>
          <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)'}}>
            <User size={20} />
            <span style={{fontSize: '0.9rem'}}>{session?.user.email}</span>
          </div>
          <button onClick={handleLogout} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#e60012', display: 'flex', alignItems: 'center', gap: '5px'}}>
            <LogOut size={20} />
            <span style={{fontSize: '0.9rem', fontWeight: 'bold'}}>Logout</span>
          </button>
        </div>
      </header>

      {showSettings && session && (
        <AccountSettings 
          userId={session.user.id} 
          onClose={() => setShowSettings(false)} 
          onSync={fetchGames}
        />
      )}

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
                        backgroundColor: 
                          p === 'XBOX' ? '#107c10' : 
                          p === 'STEAM' ? '#171a21' : 
                          p === 'PLAYSTATION' ? '#003087' : 
                          p === 'NINTENDO' ? '#e60012' : 
                          'var(--accent)',
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
