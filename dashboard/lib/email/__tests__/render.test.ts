import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText, pickLocale, renderEmail, unknownTags, type CampaignContent } from '../render';
import { TEMPLATES } from '../snippets';
import { createLinkToken, verifyLinkToken } from '../link-token';

const content = (en: Partial<CampaignContent['en']>, vi: Partial<CampaignContent['vi']> = {}): CampaignContent => ({
  en: { subject: 'Hi {{name}}', preheader: 'Preview for {{name}}', html: '<p>Hello {{name}}, your address is {{email}}.</p>', ...en },
  vi: { subject: '', preheader: '', html: '', ...vi },
});
const url = 'https://admin.example/api/email/unsubscribe?t=abc';

test('merge tags fill in, HTML-escape in the body, and fall back per language', () => {
  const out = renderEmail(content({}), { email: 'a@b.test', name: '<Mai>', locale: 'en' }, url, '');
  assert.equal(out.subject, 'Hi <Mai>');
  assert.match(out.html, /Hello &lt;Mai&gt;, your address is a@b\.test\./);
  assert.doesNotMatch(out.html, /<Mai>/);
  const nameless = renderEmail(content({ html: '<p>Hi {{name|friend}} / {{ name }}</p>' }), { email: 'a@b.test', name: '  ', locale: 'en' }, url, '');
  assert.match(nameless.html, /Hi friend \/ there/);
});

test('a language with no subject or body falls back to English', () => {
  const c = content({}, { subject: 'Chào {{name}}', html: '' });
  assert.equal(pickLocale(c, 'vi'), 'en');
  const vi = content({}, { subject: 'Chào {{name}}', html: '<p>Xin chào</p>' });
  const out = renderEmail(vi, { email: 'a@b.test', name: null, locale: 'vi' }, url, '');
  assert.equal(out.locale, 'vi');
  assert.equal(out.subject, 'Chào bạn');
  assert.match(out.html, /lang="vi"/);
  assert.match(out.html, /Hủy đăng ký/);
});

test('every email carries the logo, the preheader, who it was sent to, and a working unsubscribe link in both parts', () => {
  const out = renderEmail(content({}), { email: 'a@b.test', name: 'Mai', locale: 'en' }, url, 'https://admin.example');
  assert.ok(out.html.includes('src="https://admin.example/email/kallo-wordmark-ink.png"'));
  assert.match(out.html, /sent to <span[^>]*>a@b\.test<\/span>/);
  assert.match(out.text, /sent to a@b\.test/);
  assert.match(out.html, /Preview for Mai/);
  // Enough invisible filler that phone notifications stop at the preview line
  // instead of running on into alt text (seen on iOS Gmail with 40 units).
  assert.ok((out.html.match(/&#8199;/g) ?? []).length >= 400);
  assert.equal((out.html.match(/alt="Kallo"/g) ?? []).length, 2, 'only the visible header logo and the footer logo carry alt text');
  assert.ok(out.html.includes(`href="${url}"`));
  assert.ok(out.text.includes(`Unsubscribe: ${url}`));
});

test('<!-- section --> splits the body into alternating bands', () => {
  const out = renderEmail(content({ html: '<p>One</p>\n<!-- section -->\n<p>Two</p><!-- section --><p>Three</p>' }), { email: 'a@b.test', name: null, locale: 'en' }, url, '');
  const bands = [...out.html.matchAll(/background:(#[0-9a-f]{6});font-family:Georgia[^>]*>\n<p>(\w+)<\/p>/g)].map(m => [m[2], m[1]]);
  assert.deepEqual(bands, [['One', '#faf9f5'], ['Two', '#f3f1ec'], ['Three', '#faf9f5']]);
  assert.doesNotMatch(out.text, /section/);
});

test('unknown merge tags are reported, known ones are not', () => {
  assert.deepEqual(unknownTags(content({ html: '{{nmae}} {{name}} {{ unsubscribe_url }} {{email|x}}' })), ['{{nmae}}']);
});

test('the plain-text part keeps links, lists and paragraphs readable', () => {
  const text = htmlToText('<h1>Title</h1><p>Read <a href="https://kallo.fit/x">the post</a> &amp; more&nbsp;here.</p><ul><li>One</li><li>Two</li></ul><a href="https://kallo.fit">https://kallo.fit</a><style>p{}</style>');
  assert.equal(text, 'Title\n\nRead the post (https://kallo.fit/x) & more here.\n\n- One\n- Two\n\nhttps://kallo.fit');
});

test('starter templates render with no unknown tags in both languages', () => {
  for (const t of TEMPLATES) {
    assert.deepEqual(unknownTags(t.content), [], t.id);
    if (t.id !== 'blank') assert.equal(renderEmail(t.content, { email: 'a@b.test', name: 'Mai', locale: 'vi' }, url, '').locale, 'vi');
  }
});

test('unsubscribe tokens round-trip and reject tampering or a missing secret', () => {
  const saved = process.env.EMAIL_LINK_SECRET;
  process.env.EMAIL_LINK_SECRET = 'x'.repeat(40);
  try {
    const token = createLinkToken({ email: 'Mai@Example.test', locale: 'vi', campaignId: 'c1' });
    assert.deepEqual(verifyLinkToken(token), { email: 'mai@example.test', locale: 'vi', campaignId: 'c1' });
    const [payload, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ e: 'other@example.test', l: 'en', c: null })).toString('base64url');
    assert.equal(verifyLinkToken(`${forged}.${signature}`), null);
    assert.equal(verifyLinkToken(`${payload}.${signature}x`), null);
    assert.equal(verifyLinkToken(null), null);
    process.env.EMAIL_LINK_SECRET = 'y'.repeat(40);
    assert.equal(verifyLinkToken(token), null);
    delete process.env.EMAIL_LINK_SECRET;
    assert.equal(verifyLinkToken(token), null);
    assert.throws(() => createLinkToken({ email: 'a@b.test', locale: 'en', campaignId: null }), /EMAIL_LINK_SECRET/);
  } finally { if (saved === undefined) delete process.env.EMAIL_LINK_SECRET; else process.env.EMAIL_LINK_SECRET = saved; }
});
