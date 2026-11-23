import 'server-only';
import { LOCALE_NAMES, type Locale } from './brand';
import type { LocaleContent } from './render';
import { EmailError } from './input';

// A first draft in the other language, from Workers AI (the AI binding, billed
// to the Cloudflare account, no key). The founder reviews it in the editor
// before anything is sent; nothing here sends.
export const TRANSLATE_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const CONTEXT_TOKENS = 24000;

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

// The model has a 24k-token window shared by the prompt and the answer.
// Vietnamese runs longer than English and tokenizes densely, so the answer gets
// about a token per input character, capped at what the prompt leaves.
function answerBudget(text: string, from: Locale, kind: string): number {
  const promptTokens = Math.ceil((RULES.length + text.length) / (from === 'vi' ? 2 : 3)) + 128;
  const room = CONTEXT_TOKENS - promptTokens - 256;
  const expected = Math.ceil(text.length * 0.7) + 256;   // a typical answer
  const generous = Math.ceil(text.length * 1.2) + 512;  // headroom for dense output
  if (room < expected) throw new EmailError(`The ${kind} is too long to translate in one go. Translate it in parts.`);
  return Math.min(generous, room);
}

export async function translateContent(source: LocaleContent, from: Locale, to: Locale, binding?: Ai): Promise<LocaleContent> {
  // Size every part first, so a too-long email is refused before any model call.
  const parts = ([['subject', 'subject line'], ['preheader', 'preview text'], ['html', 'HTML body']] as const)
    .map(([field, kind]) => ({ field, kind, text: source[field], budget: source[field].trim() ? answerBudget(source[field], from, kind) : 0 }));
  const model = binding ?? await ai();
  const one = async ({ text, kind, budget }: (typeof parts)[number]) => {
    if (!text.trim()) return '';
    const result = await model.run(TRANSLATE_MODEL, {
      messages: [{ role: 'system', content: RULES }, { role: 'user', content: `Translate this email ${kind} from ${LOCALE_NAMES[from]} to ${LOCALE_NAMES[to]}:\n\n${text}` }],
      max_tokens: budget,
      temperature: 0.2,
    }) as { response?: unknown; usage?: { completion_tokens?: number }; finish_reason?: string };
    const out = clean(result.response);
    if (!out) throw new EmailError(`The translation of the ${kind} came back empty. Try again.`);
    if ((result.usage?.completion_tokens ?? 0) >= budget || result.finish_reason === 'length') throw new EmailError(`The ${kind} is too long to translate in one go, so the translation was cut off. Translate it in parts.`);
    return out;
  };
  const [subject, preheader, html] = await Promise.all(parts.map(one));
  return { subject, preheader, html };
}
