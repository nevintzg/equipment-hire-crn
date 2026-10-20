import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ErrorBox, Spinner, useTitle } from '@equipment-hire/client/ui';
import { api } from '../lib/api.js';

export default function VerifyEmail() {
  useTitle('Confirm your email');
  const [params] = useSearchParams();
  const token = params.get('token');
  const sent = useRef(false);
  const m = useMutation({
    mutationFn: async () => {
      const res = await api.post('/auth/verify-email', { token });
      // Refresh so the in-memory user knows they are verified.
      await api.restore();
      return res;
    },
  });
  useEffect(() => {
    if (token && !sent.current) {
      sent.current = true;
      m.mutate();
    }
  }, [token, m]);

  return (
    <div className="container">
      <div className="card stack auth-card">
        <h1>Confirm your email</h1>
        {!token && <div className="alert alert-error">This link is incomplete.</div>}
        {m.isPending && <Spinner />}
        {m.isSuccess && <div className="alert alert-success">{m.data.message}</div>}
        <ErrorBox error={m.error} />
        <Link to="/account">Go to your account</Link>
      </div>
    </div>
  );
}
