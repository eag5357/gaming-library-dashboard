import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Save, RefreshCw, AlertCircle } from 'lucide-react';

interface Props {
  userId: string;
  onClose: () => void;
  onSync: () => void;
}

export function AccountSettings({ userId, onClose, onSync }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [steamId, setSteamId] = useState('');
  const [xboxXuid, setXboxXuid] = useState('');
  const [psnId, setPsnId] = useState('');
  const [nintendoId, setNintendoId] = useState('');

  const [syncStatus, setSyncStatus] = useState<{
    step: 'idle' | 'saving' | 'syncing' | 'normalizing' | 'done';
    currentPlatform?: string;
    progress: number;
  }>({ step: 'idle', progress: 0 });

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function fetchAccounts() {
    const { data, error } = await supabase
      .from('linked_accounts')
      .select('platform_name, provider_account_id')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching accounts:', error);
    } else if (data) {
      data.forEach(acc => {
        if (acc.platform_name === 'STEAM') setSteamId(acc.provider_account_id);
        if (acc.platform_name === 'XBOX') setXboxXuid(acc.provider_account_id);
        if (acc.platform_name === 'PLAYSTATION') setPsnId(acc.provider_account_id);
        if (acc.platform_name === 'NINTENDO') setNintendoId(acc.provider_account_id);
      });
    }
    setLoading(false);
  }

  const [nintendoRelay, setNintendoRelay] = useState<{
    active: boolean;
    authUrl: string;
    state: string;
    link: string;
    loading: boolean;
  }>({ active: false, authUrl: '', state: '', link: '', loading: false });

  const [syncStates, setSyncStates] = useState<Record<string, 'idle' | 'syncing' | 'done' | 'error'>>({
    STEAM: 'idle',
    XBOX: 'idle',
    PLAYSTATION: 'idle',
    NINTENDO: 'idle',
  });

  const handleSingleSync = async (platform: string) => {
    setSyncStates(prev => ({ ...prev, [platform]: 'syncing' }));
    try {
      const functionName = `sync-${platform.toLowerCase()}`;
      const { data, error: syncError } = await supabase.functions.invoke(functionName);
      
      if (syncError || data.error) {
        console.error(`${platform} sync failed:`, syncError || data.error);
        setSyncStates(prev => ({ ...prev, [platform]: 'error' }));
        setError(`${platform} sync failed. Check console for details.`);
      } else {
        setSyncStates(prev => ({ ...prev, [platform]: 'done' }));
        setTimeout(() => setSyncStates(prev => ({ ...prev, [platform]: 'idle' })), 3000);
        onSync(); // Refresh background data
      }
    } catch (err: any) {
      setSyncStates(prev => ({ ...prev, [platform]: 'error' }));
      setError(`Failed to trigger ${platform} sync.`);
    }
  };

  const startNintendoAuth = async () => {
    setNintendoRelay(prev => ({ ...prev, loading: true }));
    try {
      const res = await supabase.functions.invoke('auth-nintendo', {
        method: 'GET',
        headers: { 'params': JSON.stringify({ action: 'login', user_id: userId }) }
      });
      const data = res.data;
      setNintendoRelay({ active: true, authUrl: data.authUrl, state: data.state, link: '', loading: false });
    } catch (err) {
      setError("Failed to start Nintendo authentication.");
      setNintendoRelay(prev => ({ ...prev, loading: false }));
    }
  };

  const finishNintendoAuth = async () => {
    setNintendoRelay(prev => ({ ...prev, loading: true }));
    try {
      const { data, error: funcError } = await supabase.functions.invoke('auth-nintendo', {
        body: { 
          action: 'callback', 
          link: nintendoRelay.link, 
          state: nintendoRelay.state, 
          user_id: userId 
        }
      });
      if (funcError) throw funcError;
      setNintendoId(data.nintendoId);
      setNintendoRelay({ active: false, authUrl: '', state: '', link: '', loading: false });
      fetchAccounts();
    } catch (err: any) {
      setError(err.message || "Failed to link Nintendo account.");
      setNintendoRelay(prev => ({ ...prev, loading: false }));
    }
  };

  const handleLinkSteam = () => {
    const publicUrl = import.meta.env.VITE_SUPABASE_URL.replace("http://kong:", "http://127.0.0.1:");
    window.location.href = `${publicUrl}/functions/v1/auth-steam?action=login&user_id=${userId}`;
  };

  const handleLinkXbox = () => {
    const publicUrl = import.meta.env.VITE_SUPABASE_URL.replace("http://kong:", "http://127.0.0.1:");
    window.location.href = `${publicUrl}/functions/v1/auth-xbox?action=login&user_id=${userId}`;
  };

  const renderStatus = () => {
    if (syncStatus.step === 'idle') return null;

    const labels = {
      saving: 'Saving account IDs...',
      syncing: `Syncing your library...`,
      normalizing: 'Normalizing library metadata...',
      done: 'Library sync complete!'
    };

    return (
      <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', border: '1px solid var(--accent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
          <span style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{labels[syncStatus.step]}</span>
          <span>{syncStatus.progress}%</span>
        </div>
        <div style={{ width: '100%', height: '8px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ 
            width: `${syncStatus.progress}%`, 
            height: '100%', 
            backgroundColor: 'var(--accent)', 
            transition: 'width 0.4s ease-out' 
          }} />
        </div>
      </div>
    );
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button onClick={onClose} className="btn-icon" style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
          <X size={24} />
        </button>

        <h2 style={{ marginBottom: '1.5rem' }}>Library Integration</h2>

        {loading ? (
          <div>Loading accounts...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            {/* Steam Section */}
            <div className="settings-section">
              <div className="settings-header">
                <div className="settings-label-group">
                  <div className="platform-icon steam">S</div>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>Steam</div>
                    <div className={steamId ? 'status-linked' : 'status-unlinked'}>
                      {steamId ? `Linked (ID: ${steamId.slice(0, 8)}...)` : 'Not Linked'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {steamId && (
                    <button 
                      onClick={() => handleSingleSync('STEAM')}
                      disabled={syncStates.STEAM === 'syncing'}
                      className="btn-ghost"
                      style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}
                    >
                      {syncStates.STEAM === 'syncing' ? <RefreshCw size={14} className="animate-spin" /> : 'Sync Now'}
                    </button>
                  )}
                  <button type="button" onClick={handleLinkSteam} className="btn-secondary">
                    Auto-Link
                  </button>
                </div>
              </div>
              <input 
                type="text" 
                value={steamId}
                onChange={(e) => setSteamId(e.target.value)}
                placeholder="SteamID64 (e.g. 7656119...)"
                className="search-input"
              />
              <details className="settings-help">
                <summary>How do I find my Steam ID?</summary>
                <div className="help-content">
                  Go to <a href="https://steamid.io/" target="_blank" rel="noreferrer">SteamID.io</a> and enter your profile URL. Copy the <b>SteamID64</b>.
                </div>
              </details>
            </div>

            {/* Xbox Section */}
            <div className="settings-section">
              <div className="settings-header">
                <div className="settings-label-group">
                  <div className="platform-icon xbox">X</div>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>Xbox</div>
                    <div className={xboxXuid ? 'status-linked' : 'status-unlinked'}>
                      {xboxXuid ? `Linked (ID: ${xboxXuid.slice(0, 8)}...)` : 'Not Linked'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {xboxXuid && (
                    <button 
                      onClick={() => handleSingleSync('XBOX')}
                      disabled={syncStates.XBOX === 'syncing'}
                      className="btn-ghost"
                      style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}
                    >
                      {syncStates.XBOX === 'syncing' ? <RefreshCw size={14} className="animate-spin" /> : 'Sync Now'}
                    </button>
                  )}
                  <button type="button" onClick={handleLinkXbox} className="btn-secondary">
                    Auto-Link
                  </button>
                </div>
              </div>
              <input 
                type="text" 
                value={xboxXuid}
                onChange={(e) => setXboxXuid(e.target.value)}
                placeholder="Xbox XUID (Numeric)"
                className="search-input"
              />
              <details className="settings-help">
                <summary>How do I find my Xbox XUID?</summary>
                <div className="help-content">
                  Sign in to <a href="https://xbl.io/" target="_blank" rel="noreferrer">xbl.io</a>. Your <b>XUID</b> will be visible on your profile page.
                </div>
              </details>
            </div>
            
            {/* Nintendo Flow */}
            <div className="settings-section">
              <div className="settings-header">
                <div className="settings-label-group">
                  <div className="platform-icon nintendo">N</div>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>Nintendo</div>
                    <div className={nintendoId ? 'status-linked' : 'status-unlinked'}>
                      {nintendoId ? `Linked (ID: ${nintendoId.slice(0, 8)}...)` : 'Not Linked'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {nintendoId && (
                    <button 
                      onClick={() => handleSingleSync('NINTENDO')}
                      disabled={syncStates.NINTENDO === 'syncing'}
                      className="btn-ghost"
                      style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}
                    >
                      {syncStates.NINTENDO === 'syncing' ? <RefreshCw size={14} className="animate-spin" /> : 'Sync Now'}
                    </button>
                  )}
                  <button 
                    onClick={startNintendoAuth}
                    disabled={nintendoRelay.loading}
                    className="btn-primary" 
                    style={{ 
                      backgroundColor: nintendoId ? 'transparent' : '#e60012', 
                      border: nintendoId ? '1px solid #e60012' : 'none', 
                      color: nintendoId ? '#e60012' : 'white', 
                      padding: '0.4rem 0.8rem', 
                      fontSize: '0.8rem' 
                    }}
                  >
                    {nintendoRelay.loading ? <RefreshCw className="animate-spin" size={14} /> : (nintendoId ? 'Reconnect' : 'Link Account')}
                  </button>
                </div>
              </div>
                  className="btn-primary" 
                  style={{ 
                    backgroundColor: nintendoId ? 'transparent' : '#e60012', 
                    border: nintendoId ? '1px solid #e60012' : 'none', 
                    color: nintendoId ? '#e60012' : 'white', 
                    padding: '0.4rem 0.8rem', 
                    fontSize: '0.8rem' 
                  }}
                >
                  {nintendoRelay.loading ? <RefreshCw className="animate-spin" size={14} /> : (nintendoId ? 'Reconnect' : 'Link Account')}
                </button>
              </div>

              {nintendoRelay.active && (
                <div className="nintendo-flow">
                  <ol>
                    <li><a href={nintendoRelay.authUrl} target="_blank" rel="noreferrer">Login to Nintendo</a></li>
                    <li>Right-click "Select this person" and <b>Copy Link Address</b>.</li>
                  </ol>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="text" 
                      placeholder="Paste link here"
                      value={nintendoRelay.link}
                      onChange={(e) => setNintendoRelay(prev => ({ ...prev, link: e.target.value }))}
                      className="search-input"
                    />
                    <button onClick={finishNintendoAuth} className="btn-primary">Finish</button>
                  </div>
                </div>
              )}
            </div>

            {/* PlayStation Section */}
            <div className="settings-section">
              <div className="settings-header">
                <div className="settings-label-group">
                  <div className="platform-icon playstation">P</div>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>PlayStation</div>
                    <div className={psnId ? 'status-linked' : 'status-unlinked'}>
                      {psnId ? `Linked (ID: ${psnId.slice(0, 8)}...)` : 'Not Linked'}
                    </div>
                  </div>
                </div>
                {psnId && (
                  <button 
                    onClick={() => handleSingleSync('PLAYSTATION')}
                    disabled={syncStates.PLAYSTATION === 'syncing'}
                    className="btn-ghost"
                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}
                  >
                    {syncStates.PLAYSTATION === 'syncing' ? <RefreshCw size={14} className="animate-spin" /> : 'Sync Now'}
                  </button>
                )}
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <input 
                  type="text" 
                  value={psnId}
                  onChange={(e) => setPsnId(e.target.value)}
                  placeholder="PSN Account ID (Numeric)"
                  className="search-input"
                />
                <details className="settings-help">
                  <summary>How do I find my Account ID?</summary>
                  <div className="help-content">
                    1. Go to <a href="https://psn.flipscreen.games/" target="_blank" rel="noreferrer">PSN ID Lookup</a>.<br/>
                    2. Copy the <b>Numeric Account ID</b>.
                  </div>
                </details>
              </div>
            </div>

            {error && (
              <div className="error-message">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <div className="modal-actions">
              <button onClick={onClose} className="btn-ghost">Close</button>
              <button 
                onClick={async () => {
                  setSaving(true);
                  
                  // Save all IDs
                  const platforms = [
                    { name: 'STEAM', id: steamId },
                    { name: 'XBOX', id: xboxXuid },
                    { name: 'PLAYSTATION', id: psnId },
                    { name: 'NINTENDO', id: nintendoId }
                  ];

                  for (const p of platforms) {
                    if (p.id) {
                      await supabase.from('linked_accounts').upsert({
                        user_id: userId,
                        platform_name: p.name,
                        provider_account_id: p.id,
                        sync_status: 'OK'
                      }, { onConflict: 'user_id, platform_name' });
                    }
                  }
                  
                  // Trigger master sync for all linked accounts
                  setSyncStatus({ step: 'syncing', progress: 50 });
                  const { data, error: syncError } = await supabase.functions.invoke('sync-all');
                  
                  if (syncError) {
                    setError("Sync failed: " + (syncError.message || "Unknown error"));
                    setSyncStatus({ step: 'idle', progress: 0 });
                  } else if (data?.results) {
                    const failures = Object.entries(data.results)
                      .filter(([_, res]: any) => res.error)
                      .map(([platform]) => platform);
                    
                    if (failures.length > 0) {
                      setError(`Sync partially failed for: ${failures.join(', ')}. Check Supabase logs.`);
                      setSyncStatus({ step: 'idle', progress: 0 });
                    } else {
                      setSyncStatus({ step: 'done', progress: 100 });
                      setTimeout(() => { onSync(); onClose(); }, 1500);
                    }
                  } else {
                    setSyncStatus({ step: 'done', progress: 100 });
                    setTimeout(() => { onSync(); onClose(); }, 1000);
                  }
                }}
                disabled={saving}
                className="btn-primary" 
                style={{ flex: 2 }}
              >
                {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                Sync Library
              </button>
            </div>
            {renderStatus()}
          </div>
        )}
      </div>
    </div>
  );
}
