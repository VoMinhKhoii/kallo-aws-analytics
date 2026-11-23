// Kallo's campaign email brand: the light palette of kallo.fit (app/globals.css
// in the Kallo app, `--kallo-*`), laid out like a newsletter: a paper column,
// serif text, ink buttons and a dark footer. Email clients have no CSS
// variables, so every value is a literal and every style is inline.
// Sign-in and waitlist mail keep the app's dark layout; this is for campaigns.

export const SITE_URL = 'https://kallo.fit';
// Served from this dashboard's public/ folder (static files skip the login
// check), so the renderer is given the origin to load them from.
export const LOGO_INK = '/email/kallo-wordmark-ink.png';
export const LOGO_LIGHT = '/email/kallo-wordmark-light.png';

export const EMAIL_COLORS = {
  page: '#ffffff',
  paper: '#faf9f5',
  band: '#f3f1ec',
  ink: '#141413',
  text: '#3d3d3a',
  muted: '#6e6d66',
  border: '#e8e6dc',
  accent: '#c9a87c',
  accentWash: '#f1e8da',
  umber: '#695e4e',
  button: '#141413',
  buttonText: '#ffffff',
  footer: '#141413',
  footerText: '#b0aea5',
  footerRule: '#3d3d3a',
} as const;

export const COLOR_NAMES: Record<keyof typeof EMAIL_COLORS, string> = {
  page: 'Page (white)',
  paper: 'Paper (column)',
  band: 'Second band',
  ink: 'Ink (headings)',
  text: 'Body text',
  muted: 'Muted text',
  border: 'Hairline',
  accent: 'Accent (tan)',
  accentWash: 'Accent wash',
  umber: 'Umber',
  button: 'Button',
  buttonText: 'Button text',
  footer: 'Footer',
  footerText: 'Footer text',
  footerRule: 'Footer rule',
};

export const FONT_SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
export const FONT_SERIF = "Georgia,'Times New Roman',serif";

/** Where a body splits into bands; each band after the first gets the next background. */
export const SECTION_BREAK = '<!-- section -->';

export const LOCALES = ['en', 'vi'] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', vi: 'Vietnamese' };

export const FOOTER: Record<Locale, { tagline: string; sentTo: string; why: string; unsubscribe: string; defaultName: string }> = {
  en: {
    tagline: 'Vietnamese meal tracking, without the guesswork.',
    sentTo: 'This email was sent to',
    why: 'You’re getting it because you have a Kallo account. Don’t want these?',
    unsubscribe: 'Unsubscribe',
    defaultName: 'there',
  },
  vi: {
    tagline: 'Theo dõi bữa ăn Việt, không còn phải đoán.',
    sentTo: 'Email này được gửi tới',
    why: 'Bạn nhận được vì có tài khoản Kallo. Không muốn nhận nữa?',
    unsubscribe: 'Hủy đăng ký',
    defaultName: 'bạn',
  },
};
