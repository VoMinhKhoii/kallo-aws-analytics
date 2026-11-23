import { EMAIL_COLORS as C, FONT_SANS, FONT_SERIF, LOGO_INK, SITE_URL, type Locale } from '@/lib/email/brand';
import { escapeHtml } from '@/lib/email/render';
import { verifyLinkToken } from '@/lib/email/link-token';
import { emailStore, suppress } from '@/lib/email/store';

// Public: the unsubscribe link in every campaign email (and the
// List-Unsubscribe header). GET only shows a button, because mail scanners
// open links; the unsubscribe itself is a POST, either from that button or the
// inbox's one-click unsubscribe (RFC 8058).

export const dynamic = 'force-dynamic';

const COPY: Record<Locale, Record<'title' | 'ask' | 'button' | 'done' | 'doneBody' | 'invalid' | 'test' | 'failed', string>> = {
  en: {
    title: 'Unsubscribe',
    ask: 'Stop getting Kallo news and updates at {email}? You will still get sign-in and account emails.',
    button: 'Unsubscribe',
    done: 'You’re unsubscribed',
    doneBody: '{email} won’t get Kallo news and updates anymore. Changed your mind? Reply to any Kallo email and we’ll add you back.',
    invalid: 'This unsubscribe link is broken or incomplete. Reply to the email instead and we’ll take you off the list.',
    test: 'This came from a test email, so nothing changed. In a real campaign this link unsubscribes the person who got it.',
    failed: 'Something went wrong, so nothing changed. Try again in a minute, or reply to the email and we’ll take you off the list.',
  },
  vi: {
    title: 'Hủy đăng ký',
    ask: 'Ngừng nhận tin tức và cập nhật của Kallo tại {email}? Bạn vẫn nhận email đăng nhập và tài khoản.',
    button: 'Hủy đăng ký',
    done: 'Bạn đã hủy đăng ký',
    doneBody: '{email} sẽ không nhận tin tức và cập nhật của Kallo nữa. Đổi ý? Trả lời bất kỳ email nào của Kallo và chúng tôi sẽ thêm bạn lại.',
    invalid: 'Liên kết hủy đăng ký này bị hỏng hoặc không đầy đủ. Hãy trả lời email và chúng tôi sẽ xóa bạn khỏi danh sách.',
    test: 'Đây là email thử nên không có gì thay đổi. Trong chiến dịch thật, liên kết này hủy đăng ký cho người nhận.',
    failed: 'Đã có lỗi nên chưa có gì thay đổi. Hãy thử lại sau một phút, hoặc trả lời email để chúng tôi xóa bạn khỏi danh sách.',
  },
};

function page(locale: Locale, heading: string, body: string, form = '', status = 200): Response {
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(heading)} · Kallo</title></head>
<body style="margin:0;min-height:100vh;background:${C.paper};font-family:${FONT_SERIF};color:${C.text}">
<main style="max-width:520px;margin:0 auto;padding:56px 20px">
<a href="${SITE_URL}"><img src="${LOGO_INK}" width="96" height="36" alt="Kallo" style="display:block;margin:0 0 40px"></a>
<h1 style="margin:0 0 12px;font-weight:400;font-size:30px;line-height:36px;color:${C.ink}">${escapeHtml(heading)}</h1>
<p style="margin:0;font-size:17px;line-height:26px">${body}</p>${form}
</main></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' } });
}

const fill = (text: string, email: string) => escapeHtml(text).replace('{email}', `<strong style="color:${C.ink}">${escapeHtml(email)}</strong>`);

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.has('test')) return page('en', COPY.en.title, escapeHtml(COPY.en.test));
  const claims = verifyLinkToken(url.searchParams.get('t'));
  if (!claims) return page('en', COPY.en.title, escapeHtml(COPY.en.invalid), '', 400);
  const copy = COPY[claims.locale];
  const form = `<form method="post" style="margin:28px 0 0"><button type="submit" style="border:0;border-radius:10px;background:${C.button};color:${C.buttonText};padding:15px 24px;font:500 16px/20px ${FONT_SANS};cursor:pointer">${escapeHtml(copy.button)}</button></form>`;
  return page(claims.locale, copy.title, fill(copy.ask, claims.email), form);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const claims = verifyLinkToken(url.searchParams.get('t'));
  if (!claims) return page('en', COPY.en.title, escapeHtml(COPY.en.invalid), '', 400);
  const copy = COPY[claims.locale];
  try {
    const db = await emailStore();
    if (!db) throw new Error('EMAIL_DB is not bound');
    await suppress(db, claims.email, 'unsubscribed', claims.campaignId);
  } catch (error) {
    console.error('[email/unsubscribe] failed', error instanceof Error ? error.message : String(error));
    return page(claims.locale, copy.title, escapeHtml(copy.failed), '', 500);
  }
  return page(claims.locale, copy.done, fill(copy.doneBody, claims.email));
}
