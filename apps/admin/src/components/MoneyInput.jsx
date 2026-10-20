import { toCents, toDollars } from '@equipment-hire/client';
import { useState } from 'react';

/** Zero shows as an empty box (with a 0.00 placeholder) so typing replaces it. */
const display = (cents) => (cents == null || cents === 0 ? '' : toDollars(cents));

/**
 * Dollars in the box, integer cents in the value. Keeps its own text so a
 * half-typed "12." does not get reformatted under the cursor.
 */
export default function MoneyInput({ value, onChange, allowNull = false, ...rest }) {
  const [text, setText] = useState(display(value));
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    if (toCents(text) !== value) setText(display(value));
  }
  return (
    <div className="money-input">
      <span aria-hidden="true">$</span>
      <input
        className="input"
        inputMode="decimal"
        placeholder={allowNull ? '' : '0.00'}
        value={text}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setText(e.target.value);
          const cents = toCents(e.target.value);
          const next = cents == null ? (allowNull ? null : 0) : cents;
          setLast(next);
          onChange(next);
        }}
        {...rest}
      />
    </div>
  );
}
