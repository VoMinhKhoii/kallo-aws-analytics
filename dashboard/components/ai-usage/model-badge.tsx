import type { ModelMeta } from "@/lib/ai-usage/models";

/** Google's four-colour G. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-[60%]" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Anthropic's A mark, in the console ink. */
function AnthropicLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-[58%] text-[var(--console-ink)]" aria-hidden="true" fill="currentColor">
      <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
    </svg>
  );
}

/** The vendor's logo on a neutral tile, ringed in the model's own chart colour. */
export function ModelBadge({ meta, size = 24 }: { meta: ModelMeta; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-md bg-[var(--console-surface)] text-[12px] font-semibold"
      style={{
        width: size,
        height: size,
        color: meta.color,
        boxShadow: `inset 0 0 0 1.5px ${meta.color}`,
      }}
    >
      {meta.vendor === "Google" ? <GoogleLogo /> : meta.vendor === "Anthropic" ? <AnthropicLogo /> : "·"}
    </span>
  );
}
