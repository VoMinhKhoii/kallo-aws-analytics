import 'server-only';
import { LOCALE_NAMES, type Locale } from './brand';
import type { LocaleContent } from './render';
import { EmailError } from './input';

// A first draft in the other language, from Workers AI (the AI binding, billed
// to the Cloudflare account, no key). The founder reviews it in the editor
// before anything is sent; nothing here sends.
export const TRANSLATE_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

interface Ai { run(model: string, input: { messages: { role: string; content: string }[]; max_tokens?: number; temperature?: number }): Promise<{ response?: unknown }> }

async function ai(): Promise<Ai> {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const binding = (getCloudflareContext().env as { AI?: Ai }).AI;
  if (!binding) throw new EmailError('Workers AI is not bound to this Worker (the AI binding in wrangler.jsonc).');
  return binding;
}

const RULES = `You translate Kallo's emails to app users. Kallo is a Vietnamese meal and macro tracking app; keep its friendly, plain voice.
Rules:
- Output only the translation. No preamble, no notes, no code fences.
- Keep every HTML tag, attribute, inline style, URL, entity and HTML comment (such as <!-- section -->) exactly as given. Translate only the human-readable text, including alt text.
- Keep merge tags like {{name}}, {{email}}, {{unsubscribe_url}} and {{name|friend}} unchanged, except translate the fallback word after |.
- Keep the brand name "Kallo" and product names untranslated.`;

function clean(value: unknown): string {
  return String(value ?? '').trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
}

export async function translateContent(source: LocaleContent, from: Locale, to: Locale, binding?: Ai): Promise<LocaleContent> {
  const model = binding ?? await ai();
  const one = async (text: string, kind: string) => {
    if (!text.trim()) return '';
    const result = await model.run(TRANSLATE_MODEL, {
      messages: [{ role: 'system', content: RULES }, { role: 'user', content: `Translate this email ${kind} from ${LOCALE_NAMES[from]} to ${LOCALE_NAMES[to]}:\n\n${text}` }],
      max_tokens: Math.min(8000, Math.ceil(text.length / 2) + 256),
      temperature: 0.2,
    });
    return clean(result.response);
  };
  const [subject, preheader, html] = await Promise.all([one(source.subject, 'subject line'), one(source.preheader, 'preview text'), one(source.html, 'HTML body')]);
  return { subject, preheader, html };
}
