# Kallo analytics console design

## Register

Product. This is an operator console for a developer explaining a real
analytics plane under time pressure. The interface should disappear into the
work: quick scanning, defensible numbers, and candid limits.

## Physical scene

An engineer is reviewing a 27-inch monitor in a bright university lab before a
short technical Q&A. The page needs quiet contrast, compact density, and
enough explanatory context to prevent a plausible-looking number from being
mistaken for a supported conclusion.

## Visual direction

- Restrained warm-neutral palette. Ink and paper carry most of the surface;
  green, amber, and brick are reserved for proven states and data series.
- System sans for interface text and a compact tabular face for numbers. Keep
  labels short and line lengths readable.
- Borders and row rules establish structure. Cards are used for independent
  analytical blocks, not as a repeated icon-and-copy grid.
- No gradients, decorative motion, or visual treatment that implies more
  precision than the underlying aggregate provides.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--console-bg` | `oklch(0.985 0.006 90)` | Main page surface |
| `--console-panel` | `oklch(0.975 0.008 90)` | Sidebar and quiet panels |
| `--console-surface` | `oklch(0.998 0.002 90)` | Tables and focused blocks |
| `--console-ink` | `oklch(0.22 0.018 70)` | Headings and primary values |
| `--console-muted` | `oklch(0.52 0.018 75)` | Supporting copy and axes |
| `--console-rule` | `oklch(0.89 0.018 85)` | Dividers and field borders |
| `--console-green` | `oklch(0.47 0.12 150)` | Healthy/accepted state |
| `--console-amber` | `oklch(0.58 0.12 75)` | Neutral watch state |
| `--console-brick` | `oklch(0.52 0.16 32)` | Error/rejected state |
| `--console-blue` | `oklch(0.52 0.13 250)` | Links and secondary series |

All colors must remain legible without relying on color alone. Every chart or
status indicator has a text label, count, pattern, or table equivalent.

## Layout

- Desktop-first shell: 240px persistent navigation, 56px top utility bar, and
  a content column capped at 1440px.
- Primary pages are `/`, `/ai`, `/ingredients`, and `/system`. Pipeline,
  retrieval, coverage, and trace pages remain reachable in a secondary
  diagnosis section. There is no user-behavior page.
- The first row on each page establishes the page purpose, data window, and
  source state. The next row carries the most decision-relevant comparison or
  distribution. Detail tables follow below.
- Use a 12-column grid on wide screens, collapsing to one column below 900px.
  Do not force wide tables into clipped cards; allow horizontal scrolling with
  visible column headers.
- Mobile keeps the same order and meaning, collapses navigation behind a menu,
  and moves segment controls into a wrapping row.

## Interaction rules

- Range controls are explicit: Today/24h and 30d defaults are labeled by page,
  and changing a range updates only the metrics that page requests.
- Platform, locale, and meal-mode controls are honest scope controls. If the
  backing aggregate has no dimension, the control is disabled and says that the
  source does not support that cut.
- Run controls surface the server-authoritative shared guard and polling
  behavior. Browser state is only a convenience; a disabled action explains
  the server's next-allowed time and is never simulated.
- Focus states are visible, keyboard order follows reading order, and every
  icon-only button has an accessible label.
- No animation is required to understand a number. Loading transitions are
  limited to 150–200ms state changes when useful.

## Data states

Every metric block supports four states:

1. Loading: a compact skeleton matching the final shape.
2. Live: source badge, value, and a short definition where the denominator
   matters.
3. Empty or insufficient: explain that no consented telemetry or no eligible
   rows were available. This is not a fetch error.
4. Error: state which source failed and keep unrelated blocks usable. Never
   substitute mock, stale, or synthetic numbers.

Low sample sizes are described neutrally, for example “n=3 eligible actors”.
Use “associated with” or “observed” rather than causal or severity language.
DAU/WAU definitions and every rate denominator must be visible near the value.

## Private console access

The dashboard is a private operator surface, not an account-wide identity
system. Access fails closed until all five server environment variable names
are configured: `DASHBOARD_FOUNDER_USERNAME`, `DASHBOARD_FOUNDER_PASSWORD`,
`DASHBOARD_REVIEWER_USERNAME`, `DASHBOARD_REVIEWER_PASSWORD`, and
`DASHBOARD_SESSION_SECRET`. The login page shows a setup state and the names
only; it never renders credential values. Passwords and the signing secret
are bounded before the app will serve protected data.

Successful login creates a role-only, HMAC-signed session with an eight-hour
expiry in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie. The cookie carries
no username, email, or raw identifier. Founder sessions may request a manual
snapshot or weekly insight; reviewer sessions are read-only. Both middleware
and route handlers enforce those roles, so hiding a control in the browser is
not the security boundary. Mutating requests also require a matching `Origin`
and same-origin URL; this is a lightweight CSRF boundary for the private
console and assumes the deployment's forwarded-origin headers are controlled
by its trusted proxy. Logout is a same-origin POST that expires the cookie.

## Data sources

- AWS aggregate contracts are requested by page and only for the range needed
  by that page. The complete contract is thirteen operational metrics.
- Existing cached Supabase RPCs provide corpus, unresolved, request, and trace
  drilldowns. Raw user/session identifiers and source payloads never render.
- Consent/default-deny absence is an honest no-data state. It is distinct from
  an unavailable API or an invalid configuration.
