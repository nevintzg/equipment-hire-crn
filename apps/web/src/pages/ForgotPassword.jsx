import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ErrorBox, Field, useForm, useTitle } from '@equipment-hire/client/ui';
import { api } from '../lib/api.js';

export default function ForgotPassword() {
  useTitle('Reset your password');
  const f = useForm({ email: '' });
  const m = useMutation({
    mutationFn: () => api.post('/auth/forgot-password', f.values),
    onError: f.fail,
  });
  return (
    <div className="container">
      <form
        className="card stack auth-card"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <h1>Reset your password</h1>
        {m.isSuccess ? (
          <div className="alert alert-success">{m.data.message}</div>
        ) : (
          <>
            <p className="muted">
              Enter your email and we&rsquo;ll send you a link to choose a new password.
            </p>
            <ErrorBox error={f.formError} />
            <Field label="Email" error={f.errors.email}>
              <input
                className="input"
                type="email"
                value={f.values.email}
                onChange={f.set('email')}
                required
              />
            </Field>
            <button className="btn btn-primary btn-block" disabled={m.isPending}>
              Send reset link
            </button>
          </>
        )}
        <Link to="/login">Back to sign in</Link>
      </form>
    </div>
  );
}
