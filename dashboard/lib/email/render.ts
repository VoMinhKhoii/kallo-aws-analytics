import { EMAIL_COLORS as C, FONT_SANS, FONT_SERIF, FOOTER, LOGO_INK, LOGO_LIGHT, SECTION_BREAK, SITE_URL, type Locale } from './brand';

// One renderer for the editor preview, test sends and the real send, so what
// the founder sees is byte-for-byte what recipients get.

export interface LocaleContent { subject: string; preheader: string; html: string }
export type CampaignContent = Record<Locale, LocaleContent>;
export interface Recipient { email: string; name: string | null; locale: Locale }
export interface RenderedEmail { locale: Locale; subject: string; preheader: string; html: string; text: string }

export const MERGE_TAGS = ['name', 'email', 'unsubscribe_url'] as const;
const TAG = /\{\{\s*([a-z_]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** A language with no subject or body falls back to English. */
export function pickLocale(content: CampaignContent, wanted: Locale): Locale {
  const c = content[wanted];
  return c.subject.trim() && c.html.trim() ? wanted : 'en';
}

/** Merge tags the renderer does not know, e.g. a typo like {{nmae}}. */
export function unknownTags(content: CampaignContent): string[] {
  const found = new Set<string>();
  for (const c of Object.values(content)) for (const text of [c.subject, c.preheader, c.html]) {
    for (const m of text.matchAll(TAG)) if (!(MERGE_TAGS as readonly string[]).includes(m[1])) found.add(m[0]);
  }
  return [...found];
}

// {{name|friend}}: the text after | stands in when the value is empty, before
// the per-language default ("there" / "bạn").
function merge(template: string, values: Record<string, string>, defaults: Record<string, string>, html: boolean): string {
  return template.replace(TAG, (whole, key: string, fallback?: string) => {
    if (!(key in values)) return whole;
    const value = values[key] || fallback || defaults[key] || '';
    return html ? escapeHtml(value) : value;
  });
}

/** `assetOrigin` serves the logos: this dashboard's origin when sending, the page's own in the preview. */
export function renderEmail(content: CampaignContent, recipient: Recipient, unsubscribeUrl: string, assetOrigin: string): RenderedEmail {
  const locale = pickLocale(content, recipient.locale);
  const c = content[locale];
  const footer = FOOTER[locale];
  const values = { name: recipient.name?.trim().replace(/\s+/g, ' ') ?? '', email: recipient.email, unsubscribe_url: unsubscribeUrl };
  const defaults = { name: footer.defaultName };
  const subject = merge(c.subject, values, defaults, false).replace(/\s+/g, ' ').trim();
  const preheader = merge(c.preheader, values, defaults, false).trim();
  const body = merge(c.html, values, defaults, true);
  const html = layout({ locale, preheader, body, email: recipient.email, unsubscribeUrl, assetOrigin });
  const text = [htmlToText(body), '', '—', footer.tagline, `${footer.sentTo} ${recipient.email}. ${footer.why}`, `${footer.unsubscribe}: ${unsubscribeUrl}`, SITE_URL].join('\n');
  return { locale, subject, preheader, html, text };
}

const pad = 'padding-left:36px;padding-right:36px';
const small = `margin:0;font-family:${FONT_SANS};font-size:12px;line-height:18px;color:${C.footerText}`;

// Dark mode for clients that honour prefers-color-scheme (Apple Mail, iOS
// Mail, Outlook.com via [data-ogsc]). Blocks carry k-* classes for the parts
// whose colours must change; plain text follows the band. Gmail's apps ignore
// this and invert colours themselves, so the logos carry an outline that only
// shows once inverted.
const DARK = {
  page: '#141413', paper: '#1f1e1d', band: '#262624', card: '#2c2b29', wash: '#3a3226',
  ink: '#faf9f5', text: '#d9d6cc', muted: '#a3a097', dot: '#e0c9a6',
};
const darkRules = (p: string) => `${p}.k-page{background:${DARK.page}!important}${p}.k-paper{background:${DARK.paper}!important}${p}.k-band{background:${DARK.band}!important}
${p}.k-sec,${p}.k-sec p,${p}.k-sec li,${p}.k-sec td{color:${DARK.text}!important}${p}.k-sec h1,${p}.k-sec h2,${p}.k-sec h3,${p}.k-sec .k-ink,${p}.k-sec a{color:${DARK.ink}!important}${p}.k-sec .k-muted{color:${DARK.muted}!important}
${p}.k-card{background:${DARK.card}!important}${p}.k-callout,${p}.k-dot{background:${DARK.wash}!important}${p}.k-sec .k-dot{color:${DARK.dot}!important}
${p}.k-btn{background:${DARK.ink}!important}${p}.k-sec .k-btn a{color:${C.ink}!important}
${p}.k-logo-light{display:none!important}${p}.k-logo-dark{display:block!important;max-height:none!important;overflow:visible!important}`;
const STYLE = `:root{color-scheme:light dark;supported-color-schemes:light dark}
@media (max-width:640px){.pad{padding-left:20px!important;padding-right:20px!important}.wrap{width:100%!important}h1{font-size:26px!important;line-height:32px!important}}
@media (prefers-color-scheme:dark){${darkRules('')}}
${darkRules('[data-ogsc] ')}`;

/**
 * Kallo's shell around the founder's body HTML: logo, then the body as bands
 * (split at <!-- section -->, alternating paper and band), then a dark footer
 * with who it was sent to and the unsubscribe link. 640px wide, 20px gutters
 * on phones.
 */
export function layout({ locale, preheader, body, email, unsubscribeUrl, assetOrigin }: { locale: Locale; preheader: string; body: string; email: string; unsubscribeUrl: string; assetOrigin: string }): string {
  const f = FOOTER[locale];
  // The preview line inbox apps show next to the subject, then ~1,300
  // invisible characters so phone notifications and snippets stop there
  // instead of running on into the logos' alt text and the body.
  const hidden = preheader ? `<div style="display:none!important;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(preheader)}${' &#8199;&#847;&shy;'.repeat(440)}</div>` : '';
  const sections = body.split(SECTION_BREAK).map(part => part.trim()).filter(Boolean);
  const bands = sections.map((part, i) => `<tr><td class="pad k-sec ${i % 2 ? 'k-band' : 'k-paper'}" style="${pad};padding-top:${i ? 40 : 36}px;padding-bottom:40px;background:${i % 2 ? C.band : C.paper};font-family:${FONT_SERIF};font-size:17px;line-height:26px;color:${C.text}">
${part}
</td></tr>`).join('\n');
  const link = `color:${C.border};text-decoration:underline`;
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<style>${STYLE}</style></head>
<body class="k-page" style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">${hidden}
<table role="presentation" class="k-page" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page}"><tr><td align="center">
<table role="presentation" class="wrap k-paper" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;background:${C.paper}">
<tr><td class="pad k-paper" style="${pad};padding-top:32px;padding-bottom:${bands ? 0 : 36}px;background:${C.paper}"><a href="${SITE_URL}"><img class="k-logo-light" src="${assetOrigin}${LOGO_INK}" width="96" height="37" alt="Kallo" style="display:block;width:96px;height:37px;border:0;outline:none;text-decoration:none" /><!--[if !mso]><!--><img class="k-logo-dark" src="${assetOrigin}${LOGO_LIGHT}" width="96" height="37" alt="" style="display:none;width:96px;height:37px;max-height:0;overflow:hidden;border:0;outline:none;text-decoration:none" /><!--<![endif]--></a></td></tr>
${bands}
<tr><td class="pad" style="${pad};padding-top:36px;padding-bottom:36px;background:${C.footer}">
<img src="${assetOrigin}${LOGO_LIGHT}" width="80" height="31" alt="Kallo" style="display:block;width:80px;height:31px;border:0;margin:0 0 12px" />
<p style="${small};font-family:${FONT_SERIF};font-size:15px;line-height:22px;color:${C.buttonText};margin:0 0 24px">${escapeHtml(f.tagline)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${C.footerRule};padding-top:20px">
<p style="${small}">${escapeHtml(f.sentTo)} <span style="color:${C.border}">${escapeHtml(email)}</span>. ${escapeHtml(f.why)} <a href="${escapeHtml(unsubscribeUrl)}" style="${link}">${escapeHtml(f.unsubscribe)}</a>.</p>
<p style="${small};margin-top:8px"><a href="${SITE_URL}" style="${link}">kallo.fit</a></p>
</td></tr></table>
</td></tr>
</table>
</td></tr></table></body></html>`;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…', middot: '·', zwnj: '' };

/** The plain-text part. A missing text/plain part is a strong spam signal. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, '').trim();
      return !text || text === href ? href : `${text} (${href})`;
    })
    .replace(/<img\b[^>]*alt=["']([^"']*)["'][^>]*>/gi, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|h[1-6]|div|tr|table|ul|ol|blockquote)>/gi, '\n\n')
    .replace(/<hr\b[^>]*>/gi, '\n———\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[\da-f]+|[a-z\d]+);/gi, (whole, name: string) => {
      if (name[0] === '#') { const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10); return code === 847 ? '' : String.fromCodePoint(code); }
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
