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

  const [syncStatus, setSyncStatus] = useState<{
    step: 'idle' | 'saving' | 'syncing' | 'normalizing' | 'done';
    currentPlatform?: string;
    progress: number;
  }>({ step: 'idle', progress: 0 });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSyncStatus({ step: 'saving', progress: 10 });

    const platformData = [
      { name: 'STEAM', id: steamId, function: 'sync-steam' },
      { name: 'XBOX', id: xboxXuid, function: 'sync-xbox' },
      { name: 'PLAYSTATION', id: psnId, function: 'sync-psn' },
      { name: 'NINTENDO', id: nintendoId, function: 'sync-nintendo' }
    ].filter(p => p.id.trim() !== '');

    try {
      // 1. Save IDs
      for (const p of platformData) {
        const { error } = await supabase
          .from('linked_accounts')
          .upsert({
            user_id: userId,
            platform_name: p.name as any,
            provider_account_id: p.id
          }, { onConflict: 'user_id, platform_name, provider_account_id' });
        
        if (error) throw error;
      }
      
      setSyncStatus({ step: 'syncing', progress: 30 });

      // 2. Trigger Sync Functions
      for (let i = 0; i < platformData.length; i++) {
        const p = platformData[i];
        setSyncStatus(prev => ({ ...prev, currentPlatform: p.name, progress: 30 + (i * 20) }));
        
        try {
          const { error: syncError } = await supabase.functions.invoke(p.function);
          if (syncError) console.warn(`Could not trigger ${p.function} automatically:`, syncError);
        } catch (e) {
          console.warn(`Function ${p.function} invocation failed.`);
        }
      }

      setSyncStatus({ step: 'normalizing', progress: 80 });
      try {
        await supabase.functions.invoke('normalize-games');
      } catch (e) {
        console.warn("Normalization trigger failed.");
      }

      setSyncStatus({ step: 'done', progress: 100 });
      setTimeout(() => {
        onSync();
        onClose();
      }, 1500);

    } catch (err: any) {
      setError(err.message);
      setSyncStatus({ step: 'idle', progress: 0 });
    } finally {
      setSaving(false);
    }
  };

  const renderStatus = () => {
    if (syncStatus.step === 'idle') return null;

    const labels = {
      saving: 'Saving account IDs...',
      syncing: `Syncing ${syncStatus.currentPlatform}...`,
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
        maxWidth: '500px',
        border: '1px solid var(--border)',
        position: 'relative'
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

        <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          Account Linking
        </h2>

        {loading ? (
          <div>Loading accounts...</div>
        ) : (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="input-group">
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Steam ID</label>
              <input
                type="text"
                placeholder="64-bit Steam ID (e.g. 76561198...)"
                value={steamId}
                onChange={(e) => setSteamId(e.target.value)}
                className="search-input"
                style={{ width: '100%', marginBottom: 0 }}
              />
            </div>

            <div className="input-group">
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Xbox XUID</label>
              <input
                type="text"
                placeholder="Numeric XUID (e.g. 253542...)"
                value={xboxXuid}
                onChange={(e) => setXboxXuid(e.target.value)}
                className="search-input"
                style={{ width: '100%', marginBottom: 0 }}
              />
            </div>

            <div className="input-group">
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>PSN Account ID</label>
              <input
                type="text"
                placeholder="Numeric Account ID (not Online ID)"
                value={psnId}
                onChange={(e) => setPsnId(e.target.value)}
                className="search-input"
                style={{ width: '100%', marginBottom: 0 }}
              />
            </div>

            <div className="input-group">
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Nintendo Account ID</label>
              <input
                type="text"
                placeholder="16-character hex ID"
                value={nintendoId}
                onChange={(e) => setNintendoId(e.target.value)}
                className="search-input"
                style={{ width: '100%', marginBottom: 0 }}
              />
            </div>

            {error && (
              <div style={{ color: '#e60012', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            {renderStatus()}

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={onClose}
                className="sort-select"
                style={{ flex: 1, padding: '0.75rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="sort-select"
                style={{ 
                  flex: 1, 
                  padding: '0.75rem', 
                  cursor: 'pointer',
                  backgroundColor: 'var(--accent)',
                  color: 'white',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px'
                }}
              >
                {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                Save & Sync
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
