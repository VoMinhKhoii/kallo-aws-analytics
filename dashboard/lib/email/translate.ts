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
    // Vietnamese runs longer than English and tokenizes densely, so allow about
    // a token per input character (the model's window is 24k tokens).
    const budget = Math.min(16000, Math.ceil(text.length * 1.2) + 512);
    const result = await model.run(TRANSLATE_MODEL, {
      messages: [{ role: 'system', content: RULES }, { role: 'user', content: `Translate this email ${kind} from ${LOCALE_NAMES[from]} to ${LOCALE_NAMES[to]}:\n\n${text}` }],
      max_tokens: budget,
      temperature: 0.2,
    }) as { response?: unknown; usage?: { completion_tokens?: number } };
    const out = clean(result.response);
    if (!out) throw new EmailError(`The translation of the ${kind} came back empty. Try again.`);
    if ((result.usage?.completion_tokens ?? 0) >= budget) throw new EmailError(`The ${kind} is too long to translate in one go, so the translation was cut off. Translate it in parts.`);
    return out;
  };
  const [subject, preheader, html] = await Promise.all([one(source.subject, 'subject line'), one(source.preheader, 'preview text'), one(source.html, 'HTML body')]);
  return { subject, preheader, html };
}
