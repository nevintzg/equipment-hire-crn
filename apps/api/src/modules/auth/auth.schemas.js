import { z } from 'zod';

/**
 * Request schemas for the auth routes.
 *
 * The password rule is length-first (12 characters, no composition
 * requirements) following current NIST guidance: forcing a symbol and a digit
 * produces "Password1!" and a sticky note, while length is what actually
 * resists cracking. The only other check is that it is not one of the
 * handful of passwords every list starts with.
 */
const WORST_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  '123456789',
  '1234567890',
  'qwertyuiop',
  'letmein123',
  'welcome123',
  'iloveyou',
  'adminadmin',
  'administrator',
]);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), 'Enter a valid email address');

export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters — a short phrase works well')
  .max(128, 'That password is too long')
  .refine((v) => !WORST_PASSWORDS.has(v.toLowerCase()), 'That password is too common');

/** Australian mobile or landline, with or without spaces and +61. */
export const phoneSchema = z
  .string()
  .trim()
  .max(24)
  .refine(
    (v) => v === '' || /^(\+?61|0)[2-478](\s?\d){8}$/.test(v.replace(/[\s()-]/g, '')),
    'Enter a valid Australian phone number',
  )
  .optional();

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1, 'Enter your first name').max(80),
  lastName: z.string().trim().min(1, 'Enter your last name').max(80),
  phone: phoneSchema,
  /** "Hiring organisation" — the club or school a person books for. */
  hirerOrgName: z.string().trim().max(160).optional(),
  hirerAbn: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{11}$/.test(v.replace(/\s/g, '')), 'An ABN is 11 digits')
    .optional(),
  /** Claimed customer type; staff confirm it before the rate applies. */
  customerTypeId: z.uuid().optional(),
  addressLine1: z.string().trim().max(160).optional(),
  addressLine2: z.string().trim().max(160).optional(),
  suburb: z.string().trim().max(80).optional(),
  state: z.enum(['SA', 'VIC', 'NSW', 'QLD', 'WA', 'TAS', 'NT', 'ACT']).optional(),
  postcode: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{4}$/.test(v), 'Enter a 4-digit postcode')
    .optional(),
  acceptTerms: z.literal(true, { message: 'You need to accept the terms to create an account' }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(16),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({ token: z.string().min(16) });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: passwordSchema,
});

export const updateProfileSchema = registerSchema
  .omit({ password: true, email: true, acceptTerms: true, customerTypeId: true })
  .partial();

export const acceptInviteSchema = z.object({
  token: z.string().min(16),
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
});
