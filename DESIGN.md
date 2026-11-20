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

- No cards. The page is open space split by 1px warm rules; colour is kept for
  data. Charts take the room, and figures stand bare, without boxes.
- Light and dark themes on one warm neutral ramp. The theme follows the OS
  until someone presses the sun/moon button in the top bar; the choice is
  stored in the browser and applied before paint.
- One bronze accent marks the current page, the chosen tab and focus. Every
  single choice (window, status, type, metric) is plain text with a bronze
  underline, never a pill or segmented control.
- Navigation is a top bar of text links in three groups. Pages have a title and
  no subtitle: what a page shows is in its numbers. Definitions sit in a
  footnote or a tooltip.
- One typeface: DM Sans, variable, at 400, 450, 500 and 550, with tabular
  figures. Body 14px, captions 12px and never smaller, section titles 16px,
  page titles 24px, headline figures 38px and supporting figures 22px.
- Each data page leads with one row of big figures, and every figure is a tab:
  picking it shows its chart (or its table) in the large panel below. Open
  work or a companion chart sits to the right of the tabs. Tables and lists
  follow. A definition goes in a tooltip or footnote, not in a line of small
  text under the number. The window picker sits beside the page title.
- Time series are lines, not bars. Where one chart needs two levels of the same
  measure (p95 and p99), the second is dashed in the same colour.
- Radii are 3 to 5px. No shadows except on popovers.
- Icons come from Phosphor at 16px, used sparingly.

## Tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--console-bg` | `#ffffff` | `#000000` | Page |
| `--console-surface` | `#f8f6f3` | `#0d0b0a` | Code blocks, skeletons |
| `--console-hover` | `#f1eeea` | `#141210` | Hovered rows |
| `--console-ink` | `#20201e` | `#ffffff` | Headings and figures |
| `--console-muted` | `#625d57` | `#c2bbb4` | Supporting text, idle tabs |
| `--console-faint` | `#77716c` | `#9a938c` | Captions, axis ticks, table heads |
| `--console-quiet` | `#b0a9a2` | `#4f4944` | Idle dots and chevrons, never text |
| `--console-rule` | `#e8e4df` | `#1c1a18` | Dividers |
| `--console-rule-strong` | `#ccc5be` | `#36312d` | Inputs, group separators |
| `--console-accent` | `#806047` | `#c5ac98` | Selected tab, focus |
| `--console-data` | `#46505b` | `#aeb6bf` | Main series |
| `--console-data-2` | `#b08a5e` | `#cfa77a` | Second series |
| `--console-green` | `#2e7d4f` | `#62b384` | Healthy state, good change |
| `--console-amber` | `#b7791f` | `#dcaa55` | Watch state |
| `--console-brick` | `#ae5235` | `#d0805f` | Errors, bad change |

Model series use `--model-1` … `--model-7`. Known models keep a fixed slot
(`dashboard/lib/ai-usage/models.ts`), so a model has the same color on every chart.

All colors must remain legible without relying on color alone. Every chart or
status indicator has a text label, count, pattern, or table equivalent.

## Layout

- Desktop-first shell: a 60px top bar holds the navigation; content runs the
  full width with 28px side margins. Overview adds a 288px right rail for
  open work.
- Primary pages are `/`, `/ai`, `/ingredients`, and `/system`. The old pipeline,
  retrieval, and coverage routes redirect into the consolidated pages. Exact
  trace detail is reachable from the Trace viewer. There is no user-behavior page.
- The first row on each page establishes the page purpose, data window, and
  source state. The next row carries the most decision-relevant comparison or
  distribution. Detail tables follow below.
- Use a 12-column grid on wide screens, collapsing to one column below 900px.
  Do not force wide tables into clipped cards; allow horizontal scrolling with
  visible column headers.
- Mobile keeps the same order and meaning, collapses navigation behind a menu,
  and moves segment controls into a wrapping row.

## Interaction rules

- Range controls are explicit: Today, 7d, and 30d are labeled by page,
  and every chart and summary is recomputed from the chosen window.
- Time-series charts always occupy the full content width. Related model
  breakdowns belong in the chart tooltip instead of a second adjacent chart.
- Pages backed by direct APIs expose a refresh action. Glue-only pages expose
  the manual snapshot control instead because browser refresh cannot create a
  newer aggregate.
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
snapshot; reviewer sessions are read-only. Both middleware
and route handlers enforce those roles, so hiding a control in the browser is
not the security boundary. Mutating requests also require a matching `Origin`
and same-origin URL; this is a lightweight CSRF boundary for the private
console and assumes the deployment's forwarded-origin headers are controlled
by its trusted proxy. Logout is a same-origin POST that expires the cookie.

## Data sources

- AWS aggregate contracts are requested by page and only for the range needed
  by that page. The complete contract is thirteen operational metrics.
- Google Cloud Monitoring provides normal Cloud Run request latency, request
  volume, 5xx counts, startup latency, CPU, memory, and instance data on the
  System page. Its request latency is explicitly separate from AI model call
  latency.
- One bounded Supabase RPC provides exact AI-meal trace details. The original
  meal description may render; user/session identifiers, request context,
  prompts, model wire responses, and unrestricted source payloads never do.
- Consent/default-deny absence is an honest no-data state. It is distinct from
  an unavailable API or an invalid configuration.
