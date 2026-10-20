import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ErrorBox, Field, useForm, useTitle } from '@equipment-hire/client/ui';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useSite } from '../lib/site.jsx';

/** Only same-site relative paths, so ?next= cannot redirect off-site. */
export const safeNext = (v) => (v && v.startsWith('/') && !v.startsWith('//') ? v : '/account');

export default function Login() {
  const site = useSite();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const { signedIn } = useAuth();
  const f = useForm({ email: '', password: '' });
  useTitle('Sign in', site.name);

  const login = useMutation({
    mutationFn: () => api.login(f.values.email, f.values.password),
    onSuccess: () => navigate(next, { replace: true }),
    onError: f.fail,
  });

  if (signedIn && !login.isSuccess) return <Navigate to={next} replace />;

  return (
    <div className="container">
      <form
        className="card stack auth-card"
        onSubmit={(e) => {
          e.preventDefault();
          f.clear();
          login.mutate();
        }}
      >
        <h1>Sign in</h1>
        <ErrorBox error={f.formError} />
        <Field label="Email" error={f.errors.email}>
          <input
            className="input"
            type="email"
            autoComplete="email"
            value={f.values.email}
            onChange={f.set('email')}
            required
          />
        </Field>
        <Field label="Password" error={f.errors.password}>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={f.values.password}
            onChange={f.set('password')}
            required
          />
        </Field>
        <button className="btn btn-primary btn-block" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="spread subtle">
          <Link to="/forgot-password">Forgotten your password?</Link>
          <Link to={`/register?next=${encodeURIComponent(next)}`}>Create an account</Link>
        </div>
      </form>
    </div>
  );
}
