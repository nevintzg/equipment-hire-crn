import { useMutation } from '@tanstack/react-query';
import { ErrorBox, Field, useForm, useTitle } from '@equipment-hire/client/ui';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useSite } from '../lib/site.jsx';

export default function Contact() {
  const site = useSite();
  const { user } = useAuth();
  useTitle('Contact us', site.name);
  const f = useForm({
    name: user ? `${user.firstName} ${user.lastName}` : '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    subject: '',
    message: '',
  });
  const m = useMutation({
    mutationFn: () => {
      const v = { ...f.values };
      if (!v.phone) delete v.phone;
      if (!v.subject) delete v.subject;
      return api.post('/site/contact', v);
    },
    onError: f.fail,
  });

  const phone = site.setting('contact.phone');
  const email = site.setting('contact.email');
  const address = site.setting('contact.address');
  const hours = site.setting('contact.openingHours');

  return (
    <div className="container">
      <h1>Contact us</h1>
      <div className="checkout">
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            f.clear();
            m.mutate();
          }}
        >
          {m.isSuccess ? (
            <div className="alert alert-success">{m.data.message}</div>
          ) : (
            <>
              <ErrorBox error={f.formError} />
              <div className="grid-2">
                <Field label="Your name" error={f.errors.name} required>
                  <input className="input" value={f.values.name} onChange={f.set('name')} />
                </Field>
                <Field label="Email" error={f.errors.email} required>
                  <input
                    className="input"
                    type="email"
                    value={f.values.email}
                    onChange={f.set('email')}
                  />
                </Field>
              </div>
              <div className="grid-2">
                <Field label="Phone" error={f.errors.phone}>
                  <input
                    className="input"
                    type="tel"
                    value={f.values.phone}
                    onChange={f.set('phone')}
                  />
                </Field>
                <Field label="Subject" error={f.errors.subject}>
                  <input className="input" value={f.values.subject} onChange={f.set('subject')} />
                </Field>
              </div>
              <Field label="Message" error={f.errors.message} required>
                <textarea
                  className="input"
                  rows={6}
                  value={f.values.message}
                  onChange={f.set('message')}
                />
              </Field>
              <button className="btn btn-primary" disabled={m.isPending}>
                {m.isPending ? 'Sending…' : 'Send message'}
              </button>
            </>
          )}
        </form>
        <aside className="card stack">
          <h2 style={{ margin: 0 }}>{site.name}</h2>
          <dl className="kv">
            {phone && (
              <>
                <dt>Phone</dt>
                <dd>
                  <a href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a>
                </dd>
              </>
            )}
            {email && (
              <>
                <dt>Email</dt>
                <dd>
                  <a href={`mailto:${email}`}>{email}</a>
                </dd>
              </>
            )}
            {address && (
              <>
                <dt>Address</dt>
                <dd>{address}</dd>
              </>
            )}
            {hours && (
              <>
                <dt>Hours</dt>
                <dd style={{ whiteSpace: 'pre-line' }}>{hours}</dd>
              </>
            )}
          </dl>
        </aside>
      </div>
    </div>
  );
}
