import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = isSignUp 
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div className="auth-container" style={{
      maxWidth: '400px',
      margin: '100px auto',
      padding: '2rem',
      backgroundColor: 'var(--bg-secondary)',
      borderRadius: '12px',
      border: '1px solid var(--border)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
    }}>
      <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        {isSignUp ? 'Create Account' : 'Welcome Back'}
      </h2>
      
      <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="input-group">
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="search-input"
            style={{ width: '100%', marginBottom: 0 }}
            required
          />
        </div>
        
        <div className="input-group">
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="search-input"
            style={{ width: '100%', marginBottom: 0 }}
            required
          />
        </div>

        {error && (
          <div style={{ color: '#e60012', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            {error}
          </div>
        )}

        <button 
          type="submit" 
          disabled={loading}
          className="sort-select"
          style={{ 
            width: '100%', 
            padding: '0.75rem', 
            marginTop: '1rem',
            backgroundColor: 'var(--accent)',
            color: 'white',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          {loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Log In')}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
        {isSignUp ? 'Already have an account?' : "Don't have an account?"}
        <button
          onClick={() => setIsSignUp(!isSignUp)}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: 'var(--accent)', 
            cursor: 'pointer',
            marginLeft: '5px',
            textDecoration: 'underline'
          }}
        >
          {isSignUp ? 'Log In' : 'Sign Up'}
        </button>
      </div>
    </div>
  );
}
