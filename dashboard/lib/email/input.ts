import { z } from 'zod';

// What the /email page sends. Shared by the forms and the server, which is the
// real check.

/** A failure whose message is safe and useful to show the founder as is. */
export class EmailError extends Error {}

export const MAX_PICKED = 500;
const localeContent = z.object({
  subject: z.string().max(300),
  preheader: z.string().max(300),
  html: z.string().max(200_000, 'The email body is over 200 KB. Gmail clips anything past about 100 KB.'),
});
export const contentSchema = z.object({ en: localeContent, vi: localeContent });

const isoDate = z.iso.date('Use a real date.').optional();
export const audienceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('everyone') }),
  z.object({
    kind: z.literal('group'),
    plan: z.enum(['any', 'paying', 'complimentary', 'free']),
    activity: z.enum(['any', 'active7', 'active30', 'inactive30']),
    language: z.enum(['any', 'en', 'vi']),
    joinedFrom: isoDate,
    joinedTo: isoDate,
  }),
  z.object({
    kind: z.literal('users'),
    userIds: z.array(z.string().uuid()).min(1, 'Pick at least one account.').max(MAX_PICKED, `At most ${MAX_PICKED} accounts.`).transform(ids => [...new Set(ids)]),
  }),
]);
export type Audience = z.output<typeof audienceSchema>;
export type AudienceInput = z.input<typeof audienceSchema>;

export const providerSchema = z.enum(['resend', 'cloudflare']);
export type ProviderId = z.output<typeof providerSchema>;

export const draftSchema = z.object({
  name: z.string().trim().min(1, 'Give the campaign a name.').max(120),
  content: contentSchema,
  audience: audienceSchema,
});
export type Draft = z.output<typeof draftSchema>;

export function describeAudience(a: AudienceInput): string {
  if (a.kind === 'everyone') return 'Everyone';
  if (a.kind === 'users') return `${a.userIds.length} picked account${a.userIds.length === 1 ? '' : 's'}`;
  const parts = [
    { any: '', paying: 'Paying', complimentary: 'On free Premium', free: 'Free plan' }[a.plan],
    { any: '', active7: 'logged a meal in 7 days', active30: 'logged a meal in 30 days', inactive30: 'no meal in 30 days' }[a.activity],
    { any: '', en: 'English', vi: 'Vietnamese' }[a.language],
    a.joinedFrom || a.joinedTo ? `joined ${a.joinedFrom ?? '…'} to ${a.joinedTo ?? 'now'}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Everyone';
}
