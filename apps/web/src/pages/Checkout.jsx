import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ErrorBox, Field, useTitle } from '@equipment-hire/client/ui';
import { dateRange } from '@equipment-hire/client';
import { api } from '../lib/api.js';
import { useSite } from '../lib/site.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useBasket } from '../lib/basket.jsx';
import { useHireWindow } from '../lib/useHireWindow.js';
import QuoteSummary from '../components/QuoteSummary.jsx';
import VerifyEmailNotice from '../components/VerifyEmailNotice.jsx';

function QuestionInput({ q, value, onChange }) {
  switch (q.type) {
    case 'LONG_TEXT':
      return (
        <textarea className="input" value={value} onChange={(e) => onChange(e.target.value)} />
      );
    case 'SELECT':
      return (
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {(q.options ?? []).map((o) => {
            const v = typeof o === 'string' ? o : (o.value ?? o.label);
            return (
              <option key={v} value={v}>
                {typeof o === 'string' ? o : o.label}
              </option>
            );
          })}
        </select>
      );
    case 'CHECKBOX':
      return (
        <label className="check">
          <input
            type="checkbox"
            checked={value === 'yes'}
            onChange={(e) => onChange(e.target.checked ? 'yes' : '')}
          />
          <span>Yes</span>
        </label>
      );
    case 'DATE':
      return (
        <input
          className="input"
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'NUMBER':
      return (
        <input
          className="input"
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />;
  }
}

export default function Checkout() {
  const site = useSite();
  const { user } = useAuth();
  const basket = useBasket();
  const navigate = useNavigate();
  const { quote, ready, body } = useHireWindow();
  useTitle('Complete your booking', site.name);

  const [form, setForm] = useState({
    purpose: '',
    expectedAttendees: '',
    deliveryRequired: false,
    deliveryAddress: '',
    customerNotes: '',
    acceptTerms: false,
  });
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const set = (k) => (e) =>
    setForm((f) => ({
      ...f,
      [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const questions = useQuery({
    queryKey: ['site', 'questions'],
    queryFn: () => api.get('/site/booking-questions'),
  });
  const categoryIds = new Set(basket.items.map((i) => i.categoryId).filter(Boolean));
  const relevant = (questions.data ?? []).filter(
    (q) => !q.categoryId || categoryIds.has(q.categoryId),
  );

  const submit = useMutation({
    mutationFn: (payload) => api.post('/bookings', payload),
    onSuccess: (res) => {
      basket.clear();
      navigate(
        res.nextStep === 'PAYMENT'
          ? `/bookings/${res.reference}/pay`
          : `/bookings/${res.reference}/submitted`,
        {
          replace: true,
        },
      );
    },
    onError: (err) => setErrors(err.fieldErrors ?? {}),
  });

  // Once submitted, the basket is cleared while navigation to the confirmation
  // is in flight; without this the empty-basket redirect below would win.
  if (submit.isPending || submit.isSuccess) return null;
  if (!basket.items.length || !ready) return <Navigate to="/basket" replace />;

  const missingRequired = relevant.filter(
    (q) => q.isRequired && !String(answers[q.id] ?? '').trim(),
  );
  const phoneMissing = site.setting('booking.requirePhone', true) && !user.phone;

  const onSubmit = (e) => {
    e.preventDefault();
    if (missingRequired.length) {
      setErrors(
        Object.fromEntries(
          missingRequired.map((q) => [`q.${q.id}`, 'This question needs an answer']),
        ),
      );
      return;
    }
    submit.mutate({
      ...body,
      purpose: form.purpose || undefined,
      expectedAttendees: form.expectedAttendees ? Number(form.expectedAttendees) : undefined,
      deliveryRequired: form.deliveryRequired,
      deliveryAddress: form.deliveryRequired ? form.deliveryAddress : undefined,
      customerNotes: form.customerNotes || undefined,
      answers: Object.entries(answers)
        .filter(([, v]) => String(v).trim())
        .map(([questionId, answer]) => ({ questionId, answer: String(answer) })),
      acceptTerms: form.acceptTerms,
    });
  };

  return (
    <div className="container">
      <p>
        <Link to="/basket">← Back to basket</Link>
      </p>
      <h1>Complete your booking</h1>
      <form className="checkout" onSubmit={onSubmit} noValidate>
        <div className="stack" style={{ '--gap': '1.5rem' }}>
          <VerifyEmailNotice />
          {phoneMissing && (
            <div className="alert alert-warning">
              We need a phone number to contact you about your hire.{' '}
              <Link to="/account/profile">Add one to your profile</Link>.
            </div>
          )}

          <div className="card stack">
            <h2 style={{ margin: 0 }}>About your event</h2>
            <Field
              label="What is it for?"
              hint="e.g. School fete, club presentation night"
              error={errors.purpose}
            >
              <input
                className="input"
                value={form.purpose}
                onChange={set('purpose')}
                maxLength={300}
              />
            </Field>
            <Field label="Expected number of people" error={errors.expectedAttendees}>
              <input
                className="input"
                type="number"
                min={0}
                value={form.expectedAttendees}
                onChange={set('expectedAttendees')}
              />
            </Field>
            <label className="check">
              <input
                type="checkbox"
                checked={form.deliveryRequired}
                onChange={set('deliveryRequired')}
              />
              <span>I&rsquo;d like to ask about delivery</span>
            </label>
            {form.deliveryRequired && (
              <Field label="Delivery address" error={errors.deliveryAddress}>
                <input
                  className="input"
                  value={form.deliveryAddress}
                  onChange={set('deliveryAddress')}
                />
              </Field>
            )}
            <Field label="Anything else we should know?" error={errors.customerNotes}>
              <textarea
                className="input"
                value={form.customerNotes}
                onChange={set('customerNotes')}
                maxLength={2000}
              />
            </Field>
          </div>

          {relevant.length > 0 && (
            <div className="card stack">
              <h2 style={{ margin: 0 }}>A few questions</h2>
              {relevant.map((q) => (
                <Field
                  key={q.id}
                  label={q.label}
                  hint={q.helpText}
                  required={q.isRequired}
                  error={errors[`q.${q.id}`]}
                >
                  <QuestionInput
                    q={q}
                    value={answers[q.id] ?? ''}
                    onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                  />
                </Field>
              ))}
            </div>
          )}

          <div className="card stack">
            <label className="check">
              <input type="checkbox" checked={form.acceptTerms} onChange={set('acceptTerms')} />
              <span>
                I have read and accept the{' '}
                <Link to="/terms" target="_blank">
                  terms of hire
                </Link>
                .
              </span>
            </label>
            {errors.acceptTerms && (
              <span className="error" style={{ color: 'var(--danger)' }}>
                {errors.acceptTerms}
              </span>
            )}
            <ErrorBox error={submit.error} />
          </div>
        </div>

        <aside className="card stack detail-aside">
          <h2 style={{ margin: 0 }}>Your hire</h2>
          <p className="muted" style={{ margin: 0 }}>
            {dateRange(quote.data?.startAt, quote.data?.endAt, site.tz)}
          </p>
          <QuoteSummary quote={quote} />
          <button
            className="btn btn-primary btn-lg btn-block"
            type="submit"
            disabled={
              submit.isPending || !form.acceptTerms || !quote.data?.bookable || !user.emailVerified
            }
          >
            {submit.isPending ? 'Sending…' : 'Submit booking'}
          </button>
          <p className="subtle" style={{ margin: 0 }}>
            Some bookings are confirmed straight away; others are checked by our team first. Either
            way, you only pay once your booking is approved.
          </p>
        </aside>
      </form>
    </div>
  );
}
