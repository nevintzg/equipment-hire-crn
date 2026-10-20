import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

export default function VerifyEmailNotice() {
  const { user } = useAuth();
  const resend = useMutation({ mutationFn: () => api.post('/auth/resend-verification') });
  if (!user || user.emailVerified) return null;
  return (
    <div className="alert alert-warning">
      <strong>Please confirm your email address.</strong> We sent a link to {user.email}. You need
      to confirm it before you can submit a booking.{' '}
      {resend.isSuccess ? (
        <span>A new link is on its way.</span>
      ) : (
        <button className="btn btn-sm" onClick={() => resend.mutate()} disabled={resend.isPending}>
          Send the link again
        </button>
      )}
      {resend.isError && <div>{resend.error.message}</div>}
    </div>
  );
}
