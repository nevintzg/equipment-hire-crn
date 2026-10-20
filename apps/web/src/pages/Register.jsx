import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ErrorBox, Field, useForm, useTitle } from '@equipment-hire/client/ui';
import { api } from '../lib/api.js';
import { useSite } from '../lib/site.jsx';
import { safeNext } from './Login.jsx';

const STATES = ['SA', 'VIC', 'NSW', 'QLD', 'WA', 'TAS', 'NT', 'ACT'];

export default function Register() {
  const site = useSite();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  useTitle('Create an account', site.name);

  const types = useQuery({
    queryKey: ['site', 'customer-types'],
    queryFn: () => api.get('/site/customer-types'),
  });
  const f = useForm({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    hirerOrgName: '',
    hirerAbn: '',
    customerTypeId: '',
    suburb: '',
    state: '',
    postcode: '',
    acceptTerms: false,
  });

  const register = useMutation({
    mutationFn: () => {
      const v = { ...f.values };
      for (const k of Object.keys(v)) if (v[k] === '') delete v[k];
      return api.register(v);
    },
    onSuccess: (res) => {
      if (res.created) navigate(next, { replace: true });
    },
    onError: f.fail,
  });

  if (register.isSuccess && !register.data.created) {
    return (
      <div className="container">
        <div className="card auth-card">
          <h1>Check your email</h1>
          <p>{register.data.message}</p>
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    );
  }

  const selectedType = types.data?.find((t) => t.id === f.values.customerTypeId);

  return (
    <div className="container">
      <form
        className="card stack auth-card"
        style={{ maxWidth: 620 }}
        onSubmit={(e) => {
          e.preventDefault();
          f.clear();
          register.mutate();
        }}
        noValidate
      >
        <h1>Create an account</h1>
        <p className="muted" style={{ margin: 0 }}>
          Already have one? <Link to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
        </p>
        <ErrorBox error={f.formError} />
        <div className="grid-2">
          <Field label="First name" error={f.errors.firstName} required>
            <input
              className="input"
              autoComplete="given-name"
              value={f.values.firstName}
              onChange={f.set('firstName')}
            />
          </Field>
          <Field label="Last name" error={f.errors.lastName} required>
            <input
              className="input"
              autoComplete="family-name"
              value={f.values.lastName}
              onChange={f.set('lastName')}
            />
          </Field>
        </div>
        <Field label="Email" error={f.errors.email} required>
          <input
            className="input"
            type="email"
            autoComplete="email"
            value={f.values.email}
            onChange={f.set('email')}
          />
        </Field>
        <Field label="Mobile or phone" error={f.errors.phone}>
          <input
            className="input"
            type="tel"
            autoComplete="tel"
            value={f.values.phone}
            onChange={f.set('phone')}
          />
        </Field>
        <Field
          label="Password"
          hint="At least 12 characters — a short phrase works well"
          error={f.errors.password}
          required
        >
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={f.values.password}
            onChange={f.set('password')}
          />
        </Field>

        {types.data?.length > 0 && (
          <Field
            label="Who are you hiring for?"
            hint={
              selectedType?.requiresVerification
                ? 'We will confirm this before any discounted rate applies.'
                : selectedType?.description
            }
            error={f.errors.customerTypeId}
          >
            <select
              className="input"
              value={f.values.customerTypeId}
              onChange={f.set('customerTypeId')}
            >
              <option value="">Choose one</option>
              {types.data.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid-2">
          <Field
            label="Organisation name"
            hint="Club, school or business, if any"
            error={f.errors.hirerOrgName}
          >
            <input
              className="input"
              autoComplete="organization"
              value={f.values.hirerOrgName}
              onChange={f.set('hirerOrgName')}
            />
          </Field>
          <Field label="ABN" error={f.errors.hirerAbn}>
            <input
              className="input"
              inputMode="numeric"
              value={f.values.hirerAbn}
              onChange={f.set('hirerAbn')}
            />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Suburb" error={f.errors.suburb}>
            <input
              className="input"
              autoComplete="address-level2"
              value={f.values.suburb}
              onChange={f.set('suburb')}
            />
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
              <input
                className="input"
                inputMode="numeric"
                autoComplete="postal-code"
                value={f.values.postcode}
                onChange={f.set('postcode')}
              />
            </Field>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={f.values.acceptTerms} onChange={f.set('acceptTerms')} />
          <span>
            I accept the{' '}
            <Link to="/terms" target="_blank">
              terms of hire
            </Link>
          </span>
        </label>
        {f.errors.acceptTerms && (
          <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>
            {f.errors.acceptTerms}
          </span>
        )}
        <button className="btn btn-primary btn-block" disabled={register.isPending}>
          {register.isPending ? 'Creating your account…' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
