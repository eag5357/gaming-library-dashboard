import { render, screen, fireEvent } from '@testing-library/react';
import { Auth } from './Auth';
import { vi, describe, it, expect } from 'vitest';

// Mock supabase client
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: vi.fn(() => Promise.resolve({ error: null })),
      signInWithPassword: vi.fn(() => Promise.resolve({ error: null })),
    },
  },
}));

describe('Auth Component', () => {
  it('renders login form by default', () => {
    render(<Auth />);
    expect(screen.getByText('Welcome Back')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  it('switches to sign up form when button is clicked', () => {
    render(<Auth />);
    const switchButton = screen.getByRole('button', { name: /sign up/i });
    fireEvent.click(switchButton);
    expect(screen.getByText('Create Account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument();
  });

  it('handles input changes', () => {
    render(<Auth />);
    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    
    expect(emailInput.value).toBe('test@example.com');
    expect(passwordInput.value).toBe('password123');
  });
});
