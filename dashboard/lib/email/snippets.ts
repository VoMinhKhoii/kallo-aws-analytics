import { EMAIL_COLORS as C, FONT_SANS, FONT_SERIF, SECTION_BREAK, SITE_URL } from './brand';
import type { CampaignContent } from './render';
import type { AudienceInput } from './input';

// Building blocks the editor inserts at the cursor. Inline styles and tables
// only: that is what Gmail, Apple Mail and Outlook all render the same way.
// Body text is serif; buttons and numbers are sans.

const p = `margin:0 0 16px;font-family:${FONT_SERIF};font-size:17px;line-height:26px;color:${C.text}`;
const strong = `font-weight:700;color:${C.ink}`;
// k-* classes let the layout's dark mode recolour these parts.
const ink = 'class="k-ink" ';

/** One row of a list of changes: a numbered dot, a bold title, a line or two. */
const point = (n: string, title: string, text: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr>
  <td width="52" valign="top" style="width:52px;padding-top:2px"><div class="k-dot" style="width:32px;height:32px;border-radius:16px;background:${C.accentWash};font-family:${FONT_SANS};font-size:14px;font-weight:600;line-height:32px;text-align:center;color:${C.umber}">${n}</div></td>
  <td valign="top"><p ${ink}style="margin:0 0 4px;font-family:${FONT_SERIF};font-size:18px;line-height:26px;${strong}">${title}</p><p style="margin:0;font-family:${FONT_SERIF};font-size:16px;line-height:24px;color:${C.text}">${text}</p></td>
</tr></table>`;

/** A white card for the second band, like a feature with a "Learn more" link. */
const card = (lead: string, text: string, link: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="k-card" style="margin:0 0 16px;background:${C.page};border-radius:12px"><tr><td style="padding:24px">
  <p style="margin:0 0 8px;font-family:${FONT_SERIF};font-size:16px;line-height:24px;color:${C.text}"><span ${ink}style="${strong}">${lead}</span> ${text}</p>
  <a href="${SITE_URL}" style="font-family:${FONT_SERIF};font-size:16px;line-height:24px;color:${C.ink};text-decoration:underline">${link}</a>
</td></tr></table>`;

/** A tinted box for the one thing to remember: an offer, a date, a number. */
const callout = (big: string, text: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="k-callout" style="margin:8px 0 24px;background:${C.accentWash};border-radius:12px"><tr><td style="padding:24px 28px">
  <p ${ink}style="margin:0 0 4px;font-family:${FONT_SERIF};font-size:30px;line-height:36px;color:${C.ink}">${big}</p>
  <p style="margin:0;font-family:${FONT_SERIF};font-size:16px;line-height:24px;color:${C.text}">${text}</p>
</td></tr></table>`;

const button = (label: string, url = SITE_URL) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0"><tr><td class="k-btn" style="border-radius:10px;background:${C.button}"><a href="${url}" style="display:inline-block;padding:15px 24px;font-family:${FONT_SANS};font-size:16px;font-weight:500;line-height:20px;color:${C.buttonText};text-decoration:none;border-radius:10px">${label}</a></td></tr></table>`;

export const SNIPPETS: { label: string; html: string }[] = [
  { label: 'Heading', html: `<h1 style="margin:0 0 12px;font-family:${FONT_SERIF};font-weight:400;font-size:30px;line-height:36px;color:${C.ink}">Heading</h1>` },
  { label: 'Section heading', html: `<h2 style="margin:0 0 16px;font-family:${FONT_SERIF};font-weight:400;font-size:26px;line-height:32px;color:${C.ink}">Section heading</h2>` },
  { label: 'Paragraph', html: `<p style="${p}">Write something here.</p>` },
  { label: 'Numbered point', html: point('1', 'Short title', 'One or two lines on what changed and why it helps.') },
  { label: 'Callout', html: callout('The big thing', 'One line that explains it.') },
  { label: 'Card', html: card('Bold lead-in', 'finishes the sentence with what it does for them.', 'Learn more') },
  { label: 'Button', html: button('Open Kallo') },
  { label: 'New section (band)', html: SECTION_BREAK },
  { label: 'Bullet list', html: `<ul style="margin:0 0 16px;padding-left:22px;font-family:${FONT_SERIF};font-size:17px;line-height:26px;color:${C.text}">\n  <li style="margin:0 0 6px"><span ${ink}style="${strong}">First point:</span> what it means</li>\n  <li style="margin:0 0 6px"><span ${ink}style="${strong}">Second point:</span> what it means</li>\n</ul>` },
  { label: 'Link', html: `<a href="${SITE_URL}" style="color:${C.ink};text-decoration:underline">kallo.fit</a>` },
  { label: 'Image', html: `<img src="https://kallo.fit/og-image.png" width="568" alt="Describe the image" style="display:block;width:100%;max-width:568px;height:auto;margin:8px 0 24px;border:0;border-radius:10px" />` },
  { label: 'Divider', html: `<hr style="border:0;border-top:1px solid ${C.border};margin:28px 0" />` },
  { label: 'Small print', html: `<p class="k-muted" style="margin:24px 0 0;font-family:${FONT_SERIF};font-size:14px;line-height:22px;color:${C.muted}">Small print.</p>` },
];

export const TAG_SNIPPETS = [
  { label: 'First name', html: '{{name}}' },
  { label: 'Name, with fallback', html: '{{name|friend}}' },
  { label: 'Email address', html: '{{email}}' },
  { label: 'Unsubscribe link', html: '{{unsubscribe_url}}' },
];

const s = (label: string) => SNIPPETS.find(x => x.label === label)!.html;
const heading = (t: string) => s('Heading').replace('>Heading<', `>${t}<`);
const h2 = (t: string) => s('Section heading').replace('>Section heading<', `>${t}<`);
const para = (t: string) => s('Paragraph').replace('>Write something here.<', `>${t}<`);
const list = (items: [string, string][]) => `<ul style="margin:0 0 8px;padding-left:22px;font-family:${FONT_SERIF};font-size:17px;line-height:26px;color:${C.text}">\n${items.map(([lead, rest]) => `  <li style="margin:0 0 6px"><span ${ink}style="${strong}">${lead}</span> ${rest}</li>`).join('\n')}\n</ul>`;
const fine = (t: string) => s('Small print').replace('>Small print.<', `>${t}<`);

const image = (alt: string) => s('Image').replace('alt="Describe the image"', `alt="${alt}"`);
const group = (patch: Partial<Extract<AudienceInput, { kind: 'group' }>>): AudienceInput => ({ kind: 'group', plan: 'any', activity: 'any', language: 'any', ...patch });

export interface Template { id: string; label: string; description: string; audience?: AudienceInput; content: CampaignContent }

// Placeholder copy: the shape of a good campaign, with the words left to write.
// Square brackets mark what to fill in before sending.
export const TEMPLATES: Template[] = [
  {
    id: 'announcement',
    label: 'What’s new',
    description: 'Three changes in a numbered list, then a smaller story.',
    content: {
      en: {
        subject: 'What’s new in Kallo',
        preheader: 'Three changes that make logging faster.',
        html: [
          heading('What’s new in Kallo'),
          para('Hi {{name}}, here’s what changed this month:'),
          point('1', 'The first change', 'One or two lines on what it does and why it helps.'),
          point('2', 'The second change', 'Keep each point short. Link to more if people need it.'),
          point('3', 'The third change', 'Three points is plenty. Lead with the one people asked for.'),
          button('Open Kallo'),
          SECTION_BREAK,
          h2('One more thing'),
          para('A second, smaller story: a tip, a recipe, or what’s coming next.'),
          list([['Tip:', 'one useful thing to try'], ['Coming soon:', 'what you’re working on']]),
          fine('Questions? Just reply to this email.'),
        ].join('\n'),
      },
      vi: {
        subject: 'Kallo có gì mới',
        preheader: 'Ba thay đổi giúp ghi bữa ăn nhanh hơn.',
        html: [
          heading('Kallo có gì mới'),
          para('Chào {{name}}, đây là những thay đổi trong tháng này:'),
          point('1', 'Thay đổi thứ nhất', 'Một hai dòng về tính năng và vì sao nó hữu ích.'),
          point('2', 'Thay đổi thứ hai', 'Viết ngắn gọn. Thêm đường dẫn nếu cần giải thích thêm.'),
          point('3', 'Thay đổi thứ ba', 'Ba ý là đủ. Đặt điều mọi người mong nhất lên đầu.'),
          button('Mở Kallo'),
          SECTION_BREAK,
          h2('Thêm một điều nữa'),
          para('Một câu chuyện nhỏ hơn: một mẹo, một công thức, hoặc điều sắp ra mắt.'),
          list([['Mẹo:', 'một điều hữu ích nên thử'], ['Sắp ra mắt:', 'điều đội ngũ đang làm']]),
          fine('Có câu hỏi? Chỉ cần trả lời email này.'),
        ].join('\n'),
      },
    },
  },
  {
    id: 'launch',
    label: 'Launch',
    description: 'One big feature: a picture, a headline, how it works.',
    content: {
      en: {
        subject: 'New in Kallo: [feature name]',
        preheader: '[One line on what it lets you do.]',
        html: [
          image('[What the screenshot shows]'),
          heading('[Feature name] is here'),
          para('Hi {{name}}, [say in two sentences what people can do now that they couldn’t before].'),
          button('Try it now'),
          SECTION_BREAK,
          h2('How it works'),
          point('1', '[First step]', '[What they tap or type.]'),
          point('2', '[Second step]', '[What Kallo does.]'),
          point('3', '[What they get]', '[The result, in their words.]'),
          fine('Questions? Just reply to this email.'),
        ].join('\n'),
      },
      vi: {
        subject: 'Mới trên Kallo: [tên tính năng]',
        preheader: '[Một dòng về điều nó giúp bạn làm.]',
        html: [
          image('[Ảnh chụp màn hình cho thấy gì]'),
          heading('[Tên tính năng] đã có'),
          para('Chào {{name}}, [nói trong hai câu điều bạn làm được bây giờ mà trước đây chưa làm được].'),
          button('Thử ngay'),
          SECTION_BREAK,
          h2('Cách hoạt động'),
          point('1', '[Bước đầu tiên]', '[Bạn chạm hoặc gõ gì.]'),
          point('2', '[Bước thứ hai]', '[Kallo làm gì.]'),
          point('3', '[Kết quả]', '[Điều bạn nhận được.]'),
          fine('Có câu hỏi? Chỉ cần trả lời email này.'),
        ].join('\n'),
      },
    },
  },
  {
    id: 'tips',
    label: 'Tips',
    description: 'A short how-to: five ways to get more out of Kallo.',
    audience: group({ activity: 'active30' }),
    content: {
      en: {
        subject: 'Five ways to log meals faster',
        preheader: 'Small habits that save a minute every meal.',
        html: [
          heading('Five ways to log meals faster'),
          para('Hi {{name}}, a few habits from people who log every day:'),
          point('1', '[First tip]', '[One or two lines. Link to the feature if it has one.]'),
          point('2', '[Second tip]', '[Keep it to something they can try today.]'),
          point('3', '[Third tip]', '[A real example helps, like a dish people log often.]'),
          point('4', '[Fourth tip]', '[…]'),
          point('5', '[Fifth tip]', '[…]'),
          button('Log your next meal'),
        ].join('\n'),
      },
      vi: {
        subject: 'Năm cách ghi bữa ăn nhanh hơn',
        preheader: 'Vài thói quen nhỏ giúp tiết kiệm thời gian mỗi bữa.',
        html: [
          heading('Năm cách ghi bữa ăn nhanh hơn'),
          para('Chào {{name}}, vài thói quen từ những người ghi bữa ăn mỗi ngày:'),
          point('1', '[Mẹo thứ nhất]', '[Một hai dòng. Thêm đường dẫn tới tính năng nếu có.]'),
          point('2', '[Mẹo thứ hai]', '[Điều có thể thử ngay hôm nay.]'),
          point('3', '[Mẹo thứ ba]', '[Một ví dụ thật, như món ăn hay được ghi.]'),
          point('4', '[Mẹo thứ tư]', '[…]'),
          point('5', '[Mẹo thứ năm]', '[…]'),
          button('Ghi bữa ăn tiếp theo'),
        ].join('\n'),
      },
    },
  },
  {
    id: 'offer',
    label: 'Offer',
    description: 'A Premium deal with the terms in plain view. Goes to free accounts.',
    audience: group({ plan: 'free' }),
    content: {
      en: {
        subject: '[Offer] on Kallo Premium, until [date]',
        preheader: '[What Premium adds, in one line.]',
        html: [
          heading('Try Premium for less'),
          para('Hi {{name}}, for a short time:'),
          callout('[Offer, e.g. a discount or free days]', 'On Kallo Premium, until [date].'),
          list([['[Premium feature]:', '[what it does for them]'], ['[Premium feature]:', '[what it does for them]'], ['[Premium feature]:', '[what it does for them]']]),
          button('Get Premium'),
          fine('[Terms: who it’s for, when it ends, how to cancel.]'),
        ].join('\n'),
      },
      vi: {
        subject: '[Ưu đãi] cho Kallo Premium, đến [ngày]',
        preheader: '[Premium thêm gì, trong một dòng.]',
        html: [
          heading('Dùng thử Premium với giá tốt hơn'),
          para('Chào {{name}}, trong thời gian ngắn:'),
          callout('[Ưu đãi, ví dụ giảm giá hoặc thêm ngày miễn phí]', 'Cho Kallo Premium, đến [ngày].'),
          list([['[Tính năng Premium]:', '[giúp bạn điều gì]'], ['[Tính năng Premium]:', '[giúp bạn điều gì]'], ['[Tính năng Premium]:', '[giúp bạn điều gì]']]),
          button('Nâng cấp Premium'),
          fine('[Điều khoản: dành cho ai, khi nào kết thúc, cách hủy.]'),
        ].join('\n'),
      },
    },
  },
  {
    id: 'winback',
    label: 'Come back',
    description: 'A short note for people who stopped logging. Goes to inactive accounts.',
    audience: group({ activity: 'inactive30' }),
    content: {
      en: {
        subject: 'Your Kallo log is waiting, {{name|friend}}',
        preheader: 'Here’s what changed since you last logged.',
        html: [
          heading('It’s been a while, {{name}}'),
          para('Life gets busy. Your log is still here, and picking it back up takes one meal.'),
          para('A few things changed since you last logged:'),
          list([['[Change]:', '[why it makes logging easier]'], ['[Change]:', '[why it makes logging easier]']]),
          button('Log today’s lunch'),
          fine('Not for you anymore? You can unsubscribe below and we won’t email again.'),
        ].join('\n'),
      },
      vi: {
        subject: 'Nhật ký Kallo vẫn đang chờ {{name|bạn}}',
        preheader: 'Những gì đã thay đổi từ lần cuối bạn ghi.',
        html: [
          heading('Lâu rồi không gặp, {{name}}'),
          para('Cuộc sống bận rộn mà. Nhật ký của bạn vẫn ở đây, và chỉ cần một bữa ăn để bắt đầu lại.'),
          para('Vài điều đã thay đổi từ lần cuối bạn ghi:'),
          list([['[Thay đổi]:', '[vì sao việc ghi dễ hơn]'], ['[Thay đổi]:', '[vì sao việc ghi dễ hơn]']]),
          button('Ghi bữa trưa hôm nay'),
          fine('Không cần nữa? Bạn có thể hủy đăng ký bên dưới và chúng tôi sẽ không gửi nữa.'),
        ].join('\n'),
      },
    },
  },
  {
    id: 'feedback',
    label: 'Ask for feedback',
    description: 'One question, answered by replying. Goes to active accounts.',
    audience: group({ activity: 'active30' }),
    content: {
      en: {
        subject: 'Quick question, {{name|friend}}',
        preheader: 'One reply helps us decide what to build next.',
        html: [
          para('Hi {{name}},'),
          para('We’re deciding what to build next and want to hear from people who use Kallo.'),
          callout('[Your question?]', 'Just hit reply. One line is plenty.'),
          para('We read every answer.'),
          para('— The Kallo team'),
        ].join('\n'),
      },
      vi: {
        subject: 'Một câu hỏi nhanh, {{name|bạn}}',
        preheader: 'Một câu trả lời giúp chúng tôi quyết định làm gì tiếp theo.',
        html: [
          para('Chào {{name}},'),
          para('Chúng tôi đang chọn tính năng tiếp theo và muốn nghe từ những người dùng Kallo.'),
          callout('[Câu hỏi của bạn?]', 'Chỉ cần trả lời email này. Một dòng là đủ.'),
          para('Chúng tôi đọc từng câu trả lời.'),
          para('— Đội ngũ Kallo'),
        ].join('\n'),
      },
    },
  },
  {
    id: 'note',
    label: 'Plain note',
    description: 'A personal letter: no button, no bands.',
    content: {
      en: { subject: 'A note from the Kallo team', preheader: '', html: [para('Hi {{name}},'), para('Write your note here.'), para('— The Kallo team')].join('\n') },
      vi: { subject: 'Lời nhắn từ đội ngũ Kallo', preheader: '', html: [para('Chào {{name}},'), para('Viết lời nhắn ở đây.'), para('— Đội ngũ Kallo')].join('\n') },
    },
  },
  { id: 'blank', label: 'Blank', description: 'Start from nothing but the logo and footer.', content: { en: { subject: '', preheader: '', html: '' }, vi: { subject: '', preheader: '', html: '' } } },
];

/** The block builders, for composing emails in code (scripts, tests). */
export const blocks = { heading, h2, para, point, callout, card, button, list, fine, image };
