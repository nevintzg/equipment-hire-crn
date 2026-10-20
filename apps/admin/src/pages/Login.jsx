import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ErrorBox, Field, useForm, useTitle } from '@equipment-hire/client/ui';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

const safeNext = (v) => (v && v.startsWith('/') && !v.startsWith('//') ? v : '/');

export default function Login() {
  useTitle('Sign in', 'Admin');
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const { signedIn } = useAuth();
  const f = useForm({ email: '', password: '' });
  const m = useMutation({
    mutationFn: () => api.login(f.values.email, f.values.password),
    onSuccess: () => navigate(next, { replace: true }),
    onError: f.fail,
  });
  if (signedIn && !m.isSuccess) return <Navigate to={next} replace />;
  return (
    <div className="login-wrap">
      <form
        className="card stack login-card"
        onSubmit={(e) => {
          e.preventDefault();
          f.clear();
          m.mutate();
        }}
      >
        <div>
          <span className="brand-dot" style={{ display: 'block', marginBottom: 12 }} />
          <h1 style={{ marginBottom: 4 }}>Staff sign in</h1>
          <p className="muted" style={{ margin: 0 }}>
            For the equipment hire back office. Customers sign in on the public site.
          </p>
        </div>
        <ErrorBox error={f.formError} />
        <Field label="Email" error={f.errors.email}>
          <input
            className="input"
            type="email"
            autoComplete="username"
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
        <button className="btn btn-primary btn-block" disabled={m.isPending}>
          {m.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
