/**
 * Default email templates, seeded per organisation and then editable in the
 * admin panel. Handlebars, with the variables each template may use declared
 * alongside it so the editor can show a list instead of leaving staff to
 * guess.
 *
 * Deliberately plain: community organisations forward these, print them, and
 * read them on old phones. A single-column layout with real text survives
 * that; a marketing template does not.
 */
export const LAYOUT = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{subject}}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2933;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e4e7eb;">
            <tr>
              <td style="padding:20px 28px;border-bottom:3px solid {{org.primaryColour}};">
                <strong style="font-size:17px;">{{org.name}}</strong>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;font-size:15px;line-height:1.6;">
                {{{body}}}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#fafbfc;border-top:1px solid #e4e7eb;font-size:12px;color:#616e7c;line-height:1.5;">
                {{org.name}}{{#if org.contactPhone}} &middot; {{org.contactPhone}}{{/if}}{{#if org.contactEmail}} &middot; <a href="mailto:{{org.contactEmail}}" style="color:#616e7c;">{{org.contactEmail}}</a>{{/if}}
                <br />
                This message was sent automatically. Please reply if you need help.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

/** Shared partial — the booking summary block most templates include. */
const BOOKING_SUMMARY = `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:18px 0;border-collapse:collapse;font-size:14px;">
  <tr><td style="padding:6px 0;color:#616e7c;width:150px;">Reference</td><td style="padding:6px 0;"><strong>{{booking.reference}}</strong></td></tr>
  <tr><td style="padding:6px 0;color:#616e7c;">Collect from</td><td style="padding:6px 0;">{{booking.pickupLabel}}</td></tr>
  <tr><td style="padding:6px 0;color:#616e7c;">Return by</td><td style="padding:6px 0;">{{booking.returnLabel}}</td></tr>
  <tr><td style="padding:6px 0;color:#616e7c;">Items</td><td style="padding:6px 0;">{{booking.itemsLabel}}</td></tr>
  <tr><td style="padding:6px 0;color:#616e7c;">Hire fee</td><td style="padding:6px 0;">{{booking.hireTotal}}</td></tr>
  {{#if booking.bondTotal}}<tr><td style="padding:6px 0;color:#616e7c;">Refundable bond</td><td style="padding:6px 0;">{{booking.bondTotal}}</td></tr>{{/if}}
  <tr><td style="padding:6px 0;color:#616e7c;">Total</td><td style="padding:6px 0;"><strong>{{booking.totalDue}}</strong></td></tr>
</table>`;

const button = (label, urlVar) =>
  `<p style="margin:24px 0;"><a href="{{${urlVar}}}" style="display:inline-block;background:#0f6e56;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;">${label}</a></p>
<p style="font-size:13px;color:#616e7c;">If the button does not work, copy this link into your browser:<br /><span style="word-break:break-all;">{{${urlVar}}}</span></p>`;

const COMMON_VARS = ['org.name', 'org.contactEmail', 'org.contactPhone', 'siteUrl'];
const BOOKING_VARS = [
  'booking.reference',
  'booking.pickupLabel',
  'booking.returnLabel',
  'booking.itemsLabel',
  'booking.hireTotal',
  'booking.bondTotal',
  'booking.totalDue',
  'booking.url',
  'customer.firstName',
];

export const DEFAULT_TEMPLATES = [
  {
    code: 'account.verify_email',
    name: 'Confirm your email address',
    subject: 'Confirm your email address',
    availableVariables: [...COMMON_VARS, 'firstName', 'verifyUrl'],
    bodyMarkdown: `<p>Hello {{firstName}},</p>
<p>Thanks for creating an account with {{org.name}}. Please confirm your email address so we can send you booking updates.</p>
${button('Confirm my email', 'verifyUrl')}
<p>This link works for 48 hours.</p>`,
  },
  {
    code: 'account.password_reset',
    name: 'Reset your password',
    subject: 'Reset your password',
    availableVariables: [...COMMON_VARS, 'firstName', 'resetUrl', 'expiryHours'],
    bodyMarkdown: `<p>Hello {{firstName}},</p>
<p>Someone asked to reset the password for your {{org.name}} account. If that was you, use the button below.</p>
${button('Choose a new password', 'resetUrl')}
<p>This link works for {{expiryHours}} hours. If you did not ask for this, you can ignore this email — your password has not changed.</p>`,
  },
  {
    code: 'account.duplicate_registration',
    name: 'Account already exists',
    subject: 'You already have an account with us',
    availableVariables: [...COMMON_VARS, 'signInUrl'],
    bodyMarkdown: `<p>Hello,</p>
<p>Someone tried to create an account with {{org.name}} using this email address, but you already have one.</p>
${button('Sign in instead', 'signInUrl')}
<p>If you have forgotten your password, use the "Forgot password" link on the sign-in page. If this was not you, no action is needed.</p>`,
  },
  {
    code: 'account.staff_invite',
    name: 'Staff invitation',
    subject: 'You have been invited to help manage {{org.name}} hire',
    availableVariables: [...COMMON_VARS, 'firstName', 'inviterName', 'roleName', 'inviteUrl'],
    bodyMarkdown: `<p>Hello {{firstName}},</p>
<p>{{inviterName}} has invited you to help manage equipment hire for {{org.name}} as <strong>{{roleName}}</strong>.</p>
${button('Set up my account', 'inviteUrl')}
<p>This invitation works for 7 days.</p>`,
  },
  {
    code: 'booking.submitted',
    name: 'Booking request received',
    subject: 'We have your request — {{booking.reference}}',
    availableVariables: [...COMMON_VARS, ...BOOKING_VARS],
    bodyMarkdown: `<p>Hello {{customer.firstName}},</p>
<p>Thanks for your hire request. We have it, and someone will review it shortly — usually within one working day. Nothing is reserved and no payment is due until it is approved.</p>
${BOOKING_SUMMARY}
${button('View my booking', 'booking.url')}`,
  },
  {
    code: 'booking.approved',
    name: 'Booking approved — payment required',
    subject: 'Approved — please pay to confirm {{booking.reference}}',
    availableVariables: [...COMMON_VARS, ...BOOKING_VARS, 'paymentUrl', 'paymentDueLabel'],
    bodyMarkdown: `<p>Hello {{customer.firstName}},</p>
<p>Good news — your hire request has been approved. To confirm it, please pay by <strong>{{paymentDueLabel}}</strong>. Until then the items are not held for you.</p>
${BOOKING_SUMMARY}
${button('Pay and confirm', 'paymentUrl')}
{{#if booking.bondTotal}}<p>The bond of {{booking.bondTotal}} is refunded after the equipment comes back and has been checked.</p>{{/if}}`,
  },
  {
    code: 'booking.rejected',
    name: 'Booking not approved',
    subject: 'About your hire request {{booking.reference}}',
    availableVariables: [...COMMON_VARS, ...BOOKING_VARS, 'reason'],
    bodyMarkdown: `<p>Hello {{customer.firstName}},</p>
<p>Unfortunately we are not able to go ahead with this hire request.</p>
{{#if reason}}<p><strong>Reason:</strong> {{reason}}</p>{{/if}}
<p>You have not been charged. If you would like to talk it through or try different dates, please get in touch — we are happy to help.</p>`,
  },
  {
    code: 'booking.confirmed',
    name: 'Booking confirmed',
    subject: 'Confirmed — {{booking.reference}}',
    availableVariables: [...COMMON_VARS, ...BOOKING_VARS, 'pickupInstructions'],
    bodyMarkdown: `<p>Hello {{customer.firstName}},</p>
<p>Your payment has come through and your hire is confirmed. The items below are now reserved for you.</p>
${BOOKING_SUMMARY}
{{#if pickupInstructions}}<p><strong>Collecting your equipment</strong><br />{{pickupInstructions}}</p>{{/if}}
${button('View my booking', 'booking.url')}`,
  },
  {
    code: 'booking.reminder',
    name: 'Pickup reminder',
    subject: 'Collecting your hire tomorrow — {{booking.reference}}',
    availableVariables: [...COMMON_VARS, ...BOOKING_VARS, 'pickupInstructions'],
    bodyMarkdown: `<p>Hello {{customer.firstName}},</p>
<p>A reminder that your hire starts tomorrow.</p>
${BOOKING_SUMMARY}
{{#if pickupInstructions}}<p><strong>Collecting your equipment</strong><br />{{pickupInstructions}}</p>{{/if}}`,
  },
  {
    code: 'booking.return_reminder',
    name: 'Return reminder',
    subject: 'Please return your hire by {{booking.returnLabel}}',
    availableVariables: [...COMMON_VARS, ...BOOKING_VARS],
    bodyMarkdown: `<p>Hello {{customer.firstName}},</p>
<p>Just a reminder that your hire is due back on <strong>{{booking.returnLabel}}</strong>. Returning on time means the next group can use it.</p>
${BOOKING_SUMMARY}`,
  },
  {
    code: 'booking.overdue',
    name: 'Overdue return',
    subject: 'Your hire is overdue — {{booking.reference}}',
    availableVariables: [...COMMON_VARS, ...BOOKING_VARS, 'lateFeeLabel'],
    bodyMarkdown: `<p>Hello {{customer.firstName}},</p>
<p>Our records show that the equipment below was due back on {{booking.returnLabel}} and has not been returned yet.</p>
${BOOKING_SUMMARY}
<p>Please return it as soon as you can, or contact us if something has gone wrong — we would much rather hear from you.{{#if lateFeeLabel}} A late fee of {{lateFeeLabel}} may apply.{{/if}}</p>`,
  },
  {
    code: 'booking.cancelled',
    name: 'Booking cancelled',
    subject: 'Cancelled — {{booking.reference}}',
    availableVariables: [...COMMON_VARS, ...BOOKING_VARS, 'refundLabel', 'reason'],
    bodyMarkdown: `<p>Hello {{customer.firstName}},</p>
<p>Your hire {{booking.reference}} has been cancelled.</p>
{{#if reason}}<p><strong>Reason:</strong> {{reason}}</p>{{/if}}
{{#if refundLabel}}<p>A refund of <strong>{{refundLabel}}</strong> is on its way. Card refunds usually appear within 5 to 10 business days.</p>{{/if}}`,
  },
  {
    code: 'booking.expired',
    name: 'Approval expired',
    subject: 'Your approved hire has expired — {{booking.reference}}',
    availableVariables: [...COMMON_VARS, ...BOOKING_VARS],
    bodyMarkdown: `<p>Hello {{customer.firstName}},</p>
<p>Your hire request was approved, but we did not receive payment by the deadline, so the items have been released for others to book.</p>
<p>You are welcome to submit a new request at any time.</p>
${button('Browse equipment', 'siteUrl')}`,
  },
  {
    code: 'booking.returned',
    name: 'Returned — thank you',
    subject: 'Thanks for returning {{booking.reference}}',
    availableVariables: [...COMMON_VARS, ...BOOKING_VARS],
    bodyMarkdown: `<p>Hello {{customer.firstName}},</p>
<p>Thanks for getting the equipment back to us. We will check it over{{#if booking.bondTotal}} and arrange your bond refund{{/if}}, and let you know once that is done.</p>`,
  },
  {
    code: 'booking.bond_refunded',
    name: 'Bond refunded',
    subject: 'Your bond for {{booking.reference}}',
    availableVariables: [
      ...COMMON_VARS,
      ...BOOKING_VARS,
      'refundLabel',
      'deductionLabel',
      'deductionReasons',
    ],
    bodyMarkdown: `<p>Hello {{customer.firstName}},</p>
<p>We have finished checking the equipment from {{booking.reference}}.</p>
{{#if deductionLabel}}
<p>We have had to deduct <strong>{{deductionLabel}}</strong> from your bond:</p>
<ul>{{#each deductionReasons}}<li>{{this}}</li>{{/each}}</ul>
{{/if}}
<p>A refund of <strong>{{refundLabel}}</strong> has been issued. Card refunds usually appear within 5 to 10 business days.</p>
<p>If you think something is not right, please reply to this email and we will look into it.</p>`,
  },
  {
    code: 'staff.booking_submitted',
    name: 'Staff: new request to review',
    subject: '[Action] New hire request {{booking.reference}}',
    availableVariables: [...COMMON_VARS, ...BOOKING_VARS, 'customer.name', 'adminUrl'],
    bodyMarkdown: `<p>A new hire request needs review.</p>
${BOOKING_SUMMARY}
<p><strong>Customer:</strong> {{customer.name}}</p>
${button('Review the request', 'adminUrl')}`,
  },
  {
    code: 'staff.booking_overdue',
    name: 'Staff: overdue returns',
    subject: '[Action] {{overdueCount}} overdue return(s)',
    availableVariables: [...COMMON_VARS, 'overdueCount', 'overdueList', 'adminUrl'],
    bodyMarkdown: `<p>These hires are past their return date:</p>
<ul>{{#each overdueList}}<li>{{this}}</li>{{/each}}</ul>
${button('Open the admin panel', 'adminUrl')}`,
  },
  {
    code: 'staff.contact_enquiry',
    name: 'Staff: website enquiry',
    subject: '[Enquiry] {{subjectLine}}',
    availableVariables: [...COMMON_VARS, 'name', 'email', 'phone', 'subjectLine', 'message'],
    bodyMarkdown: `<p>A new enquiry has come in through the website.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;">
  <tr><td style="padding:4px 0;color:#616e7c;width:90px;">Name</td><td style="padding:4px 0;">{{name}}</td></tr>
  <tr><td style="padding:4px 0;color:#616e7c;">Email</td><td style="padding:4px 0;">{{email}}</td></tr>
  <tr><td style="padding:4px 0;color:#616e7c;">Phone</td><td style="padding:4px 0;">{{phone}}</td></tr>
</table>
<p style="white-space:pre-wrap;margin-top:16px;">{{message}}</p>`,
  },
];

export const TEMPLATE_CODES = DEFAULT_TEMPLATES.map((t) => t.code);
