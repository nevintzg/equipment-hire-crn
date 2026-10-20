import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Badge,
  ErrorBox,
  Field,
  Spinner,
  useForm,
  useTitle,
  useToast,
} from '@equipment-hire/client/ui';
import { api } from '../../lib/api.js';
import { useSite } from '../../lib/site.jsx';

const STATES = ['SA', 'VIC', 'NSW', 'QLD', 'WA', 'TAS', 'NT', 'ACT'];

function ProfileForm({ me }) {
  const toast = useToast();
  const u = me.user;
  const f = useForm({
    firstName: u.firstName ?? '',
    lastName: u.lastName ?? '',
    phone: u.phone ?? '',
    hirerOrgName: u.hirerOrgName ?? '',
    hirerAbn: u.hirerAbn ?? '',
    addressLine1: u.address?.line1 ?? '',
    addressLine2: u.address?.line2 ?? '',
    suburb: u.address?.suburb ?? '',
    state: u.address?.state ?? '',
    postcode: u.address?.postcode ?? '',
  });
  const m = useMutation({
    mutationFn: () => {
      const v = { ...f.values };
      if (!v.state) delete v.state;
      return api.patch('/me', v);
    },
    onSuccess: (res) => {
      api.updateUser(res.user);
      toast('Your details have been saved');
    },
    onError: f.fail,
  });
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        f.clear();
        m.mutate();
      }}
    >
      <div className="spread">
        <h2 style={{ margin: 0 }}>Your details</h2>
        {me.user.customerType && (
          <Badge tone={me.user.customerTypeConfirmed ? 'success' : 'warning'}>
            {me.user.customerType.name}
            {me.user.customerTypeConfirmed ? '' : ' · awaiting confirmation'}
          </Badge>
        )}
      </div>
      <ErrorBox error={f.formError} />
      <div className="grid-2">
        <Field label="First name" error={f.errors.firstName}>
          <input className="input" value={f.values.firstName} onChange={f.set('firstName')} />
        </Field>
        <Field label="Last name" error={f.errors.lastName}>
          <input className="input" value={f.values.lastName} onChange={f.set('lastName')} />
        </Field>
      </div>
      <Field label="Email" hint="Contact us to change your email address">
        <input className="input" value={u.email} disabled />
      </Field>
      <Field label="Phone" error={f.errors.phone}>
        <input className="input" type="tel" value={f.values.phone} onChange={f.set('phone')} />
      </Field>
      <div className="grid-2">
        <Field label="Organisation" error={f.errors.hirerOrgName}>
          <input className="input" value={f.values.hirerOrgName} onChange={f.set('hirerOrgName')} />
        </Field>
        <Field label="ABN" error={f.errors.hirerAbn}>
          <input className="input" value={f.values.hirerAbn} onChange={f.set('hirerAbn')} />
        </Field>
      </div>
      <Field label="Address" error={f.errors.addressLine1}>
        <input className="input" value={f.values.addressLine1} onChange={f.set('addressLine1')} />
      </Field>
      <input
        className="input"
        aria-label="Address line 2"
        value={f.values.addressLine2}
        onChange={f.set('addressLine2')}
      />
      <div className="grid-2">
        <Field label="Suburb" error={f.errors.suburb}>
          <input className="input" value={f.values.suburb} onChange={f.set('suburb')} />
        </Field>
        <div className="grid-2">
          <Field label="State" error={f.errors.state}>
            <select className="input" value={f.values.state} onChange={f.set('state')}>
              <option value="">—</option>
              {STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Postcode" error={f.errors.postcode}>
            <input className="input" value={f.values.postcode} onChange={f.set('postcode')} />
          </Field>
        </div>
      </div>
      <div>
        <button className="btn btn-primary" disabled={m.isPending}>
          Save changes
        </button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const toast = useToast();
  const f = useForm({ currentPassword: '', newPassword: '' });
  const m = useMutation({
    mutationFn: () => api.post('/auth/change-password', f.values),
    onSuccess: () => {
      f.setValues({ currentPassword: '', newPassword: '' });
      toast('Password changed');
    },
    onError: f.fail,
  });
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        f.clear();
        m.mutate();
      }}
    >
      <h2 style={{ margin: 0 }}>Change password</h2>
      <ErrorBox error={f.formError} />
      <Field label="Current password" error={f.errors.currentPassword}>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={f.values.currentPassword}
          onChange={f.set('currentPassword')}
        />
      </Field>
      <Field label="New password" hint="At least 12 characters" error={f.errors.newPassword}>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={f.values.newPassword}
          onChange={f.set('newPassword')}
        />
      </Field>
      <div>
        <button className="btn" disabled={m.isPending}>
          Change password
        </button>
      </div>
    </form>
  );
}

function Sessions() {
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => api.post('/me/sessions/revoke-others'),
    onSuccess: (r) => toast(r.message),
  });
  return (
    <div className="card spread">
      <div>
        <h2 style={{ margin: 0 }}>Other devices</h2>
        <p className="muted" style={{ margin: 0 }}>
          Signed in on a shared computer? Sign out everywhere except here.
        </p>
      </div>
      <button className="btn" onClick={() => m.mutate()} disabled={m.isPending}>
        Sign out other devices
      </button>
    </div>
  );
}

export default function Profile() {
  const site = useSite();
  useTitle('Profile', site.name);
  const { data, isPending, error } = useQuery({ queryKey: ['me'], queryFn: () => api.get('/me') });
  if (isPending) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  return (
    <>
      <ProfileForm me={data} />
      <PasswordForm />
      <Sessions />
    </>
  );
}
