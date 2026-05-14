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
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(4px)'
    }}>
      <div className="modal-content" style={{
        backgroundColor: 'var(--bg-secondary)',
        padding: '2rem',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '550px',
        border: '1px solid var(--border)',
        position: 'relative',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <button onClick={onClose} style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          cursor: 'pointer'
        }}>
          <X size={24} />
        </button>

        <h2 style={{ marginBottom: '1.5rem' }}>Library Integration</h2>

        {loading ? (
          <div>Loading accounts...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            {/* Steam Section */}
            <div style={{ padding: '1rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#171a21', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>S</div>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>Steam</div>
                    <div style={{ fontSize: '0.8rem', color: steamId ? '#107c10' : 'var(--text-secondary)' }}>
                      {steamId ? `Linked (ID: ${steamId.slice(0, 8)}...)` : 'Not Linked'}
                    </div>
                  </div>
                </div>
                <button type="button" onClick={handleLinkSteam} className="btn-primary" style={{ backgroundColor: 'transparent', border: '1px solid #171a21', color: '#171a21', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                  Auto-Link
                </button>
              </div>
              <input 
                type="text" 
                value={steamId}
                onChange={(e) => setSteamId(e.target.value)}
                placeholder="SteamID64 (e.g. 7656119...)"
                className="search-input"
                style={{ marginBottom: '0.5rem' }}
              />
              <details style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <summary>How do I find my Steam ID?</summary>
                <div style={{ padding: '0.5rem', borderLeft: '2px solid var(--accent)', marginLeft: '0.5rem', marginTop: '0.5rem' }}>
                  Go to <a href="https://steamid.io/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>SteamID.io</a> and enter your profile URL. Copy the <b>SteamID64</b>.
                </div>
              </details>
            </div>

            {/* Xbox Section */}
            <div style={{ padding: '1rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#107c10', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>X</div>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>Xbox</div>
                    <div style={{ fontSize: '0.8rem', color: xboxXuid ? '#107c10' : 'var(--text-secondary)' }}>
                      {xboxXuid ? `Linked (ID: ${xboxXuid.slice(0, 8)}...)` : 'Not Linked'}
                    </div>
                  </div>
                </div>
                <button type="button" onClick={handleLinkXbox} className="btn-primary" style={{ backgroundColor: 'transparent', border: '1px solid #107c10', color: '#107c10', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                  Auto-Link
                </button>
              </div>
              <input 
                type="text" 
                value={xboxXuid}
                onChange={(e) => setXboxXuid(e.target.value)}
                placeholder="Xbox XUID (Numeric)"
                className="search-input"
                style={{ marginBottom: '0.5rem' }}
              />
              <details style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <summary>How do I find my Xbox XUID?</summary>
                <div style={{ padding: '0.5rem', borderLeft: '2px solid var(--accent)', marginLeft: '0.5rem', marginTop: '0.5rem' }}>
                  Sign in to <a href="https://xbl.io/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>xbl.io</a>. Your <b>XUID</b> will be visible on your profile page.
                </div>
              </details>
            </div>
            
            {/* Nintendo Flow */}
            <div style={{ padding: '1rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#e60012', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>N</div>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>Nintendo</div>
                    <div style={{ fontSize: '0.8rem', color: nintendoId ? '#107c10' : 'var(--text-secondary)' }}>
                      {nintendoId ? `Linked (ID: ${nintendoId.slice(0, 8)}...)` : 'Not Linked'}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={startNintendoAuth}
                  disabled={nintendoRelay.loading}
                  className="btn-primary" 
                  style={{ backgroundColor: nintendoId ? 'transparent' : '#e60012', border: nintendoId ? '1px solid #e60012' : 'none', color: nintendoId ? '#e60012' : 'white', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                >
                  {nintendoRelay.loading ? <RefreshCw className="animate-spin" size={14} /> : (nintendoId ? 'Reconnect' : 'Link Account')}
                </button>
              </div>

              {nintendoRelay.active && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(230, 0, 18, 0.05)', borderRadius: '8px', border: '1px solid rgba(230, 0, 18, 0.2)' }}>
                  <ol style={{ fontSize: '0.85rem', paddingLeft: '1.2rem', color: 'var(--text-primary)', margin: '0 0 1rem 0' }}>
                    <li style={{ marginBottom: '0.5rem' }}>
                      <a href={nintendoRelay.authUrl} target="_blank" rel="noreferrer" style={{ color: '#e60012', fontWeight: 'bold' }}>Click here to login to Nintendo</a>
                    </li>
                    <li style={{ marginBottom: '0.5rem' }}>On the "Select this person" page, <b>right-click</b> the button and <b>Copy Link Address</b>.</li>
                    <li>Paste that link below to finish:</li>
                  </ol>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="text" 
                      placeholder="Paste npf54789db4251161a4... link here"
                      value={nintendoRelay.link}
                      onChange={(e) => setNintendoRelay(prev => ({ ...prev, link: e.target.value }))}
                      className="search-input"
                      style={{ fontSize: '0.8rem', flex: 1, marginBottom: 0 }}
                    />
                    <button onClick={finishNintendoAuth} className="btn-primary" style={{ backgroundColor: '#e60012' }}>Finish</button>
                  </div>
                </div>
              )}
            </div>

            {/* PlayStation Section */}
            <div style={{ padding: '1rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#003087', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>P</div>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>PlayStation</div>
                    <div style={{ fontSize: '0.8rem', color: psnId ? '#107c10' : 'var(--text-secondary)' }}>
                      {psnId ? `Linked (ID: ${psnId.slice(0, 8)}...)` : 'Not Linked'}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>PSN Account ID (Numeric)</label>
                <input 
                  type="text" 
                  value={psnId}
                  onChange={(e) => setPsnId(e.target.value)}
                  placeholder="e.g. 1234567890123456789"
                  className="search-input"
                  style={{ marginBottom: '0.5rem' }}
                />
                <details style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <summary>How do I find my Account ID?</summary>
                  <div style={{ padding: '0.5rem', borderLeft: '2px solid var(--accent)', marginLeft: '0.5rem', marginTop: '0.5rem' }}>
                    1. Go to <a href="https://psn.flipscreen.games/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>PSN ID Lookup</a>.<br/>
                    2. Enter your Online ID (username).<br/>
                    3. Copy the <b>Numeric Account ID</b> and paste it above.
                  </div>
                </details>
              </div>
            </div>

            {error && (
              <div style={{ color: '#e60012', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '1rem' }}>
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
              <button onClick={onClose} className="sort-select" style={{ flex: 1 }}>Close</button>
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
                style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
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
