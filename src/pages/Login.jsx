import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { APP_NAME, supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Banner, LogoMark, Spinner } from '../components/ui';

export default function Login() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!loading && session) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(
        /fetch|network/i.test(error.message)
          ? 'Cannot reach the server. Check your internet connection and try again.'
          : 'Wrong email or password. Please check and try again.',
      );
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-brand-600 md:items-center md:justify-center">
      <div className="flex w-full max-w-md flex-1 flex-col md:flex-none">
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8 pt-[max(2rem,env(safe-area-inset-top))] text-center text-white">
          <LogoMark size={72} />
          <h1 className="mt-4 text-4xl font-bold">{APP_NAME}</h1>
          <p className="mt-1 text-base text-brand-100">Loan records and tracking</p>
        </div>

        <form onSubmit={submit} className="space-y-5 rounded-t-3xl bg-white px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-7 md:rounded-3xl md:pb-8">
          <h2 className="text-2xl font-semibold">Sign in</h2>

          <div>
            <label htmlFor="email" className="label">Email</label>
            <input
              id="email" className="input" type="email" inputMode="email" autoComplete="username"
              autoCapitalize="none" autoCorrect="off" spellCheck={false} required
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="password" className="label">Password</label>
            <div className="relative">
              <input
                id="password" className="input pr-14" type={show ? 'text' : 'password'} autoComplete="current-password"
                required value={password} onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button" onClick={() => setShow(!show)}
                aria-label={show ? 'Hide password' : 'Show password'}
                className="absolute right-1 top-1 flex h-12 w-12 items-center justify-center rounded-lg text-stone-500 active:bg-stone-100"
              >
                {show ? <EyeOff size={22} /> : <Eye size={22} />}
              </button>
            </div>
          </div>

          {error && <Banner type="error">{error}</Banner>}

          <button className="btn-primary h-14 w-full text-lg" disabled={busy}>
            {busy ? <Spinner /> : 'Sign in'}
          </button>
          <p className="text-center text-sm text-stone-500">Forgot your password? Ask the Master Admin.</p>
        </form>
      </div>
    </div>
  );
}
