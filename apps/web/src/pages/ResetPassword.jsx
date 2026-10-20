import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ErrorBox, Field, useForm, useTitle } from '@equipment-hire/client/ui';
import { api } from '../lib/api.js';

export default function ResetPassword() {
  useTitle('Choose a new password');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const f = useForm({ password: '', confirm: '' });
  const m = useMutation({
    mutationFn: () => api.post('/auth/reset-password', { token, password: f.values.password }),
    onError: f.fail,
  });
  const mismatch = f.values.confirm && f.values.confirm !== f.values.password;
  return (
    <div className="container">
      <form
        className="card stack auth-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!mismatch) m.mutate();
        }}
      >
        <h1>Choose a new password</h1>
        {!token ? (
          <div className="alert alert-error">
            This link is incomplete. Please use the link from your email.
          </div>
        ) : m.isSuccess ? (
          <>
            <div className="alert alert-success">{m.data.message}</div>
            <Link className="btn btn-primary" to="/login">
              Sign in
            </Link>
          </>
        ) : (
          <>
            <ErrorBox error={f.formError} />
            <Field label="New password" hint="At least 12 characters" error={f.errors.password}>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={f.values.password}
                onChange={f.set('password')}
              />
            </Field>
            <Field
              label="Confirm password"
              error={mismatch ? 'The passwords do not match' : undefined}
            >
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={f.values.confirm}
                onChange={f.set('confirm')}
              />
            </Field>
            <button
              className="btn btn-primary btn-block"
              disabled={m.isPending || !f.values.password || mismatch}
            >
              Save password
            </button>
          </>
        )}
      </form>
    </div>
  );
}
