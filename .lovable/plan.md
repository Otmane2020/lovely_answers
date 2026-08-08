# Adopt the lovelyanswers theme across the whole app

Goal: make this project look exactly like `Otmane2020/lovelyanswers` — one single design system (navy/blue "v4" palette) applied on every page: landing, blog, dashboard, settings, admin, checkout.

## What changes

1. **Design tokens** — replace `src/index.css` `:root` and `.dark` token blocks with the v4 palette from the reference repo:
   - paper background `#f5f6fb`, ink `#14162e`, primary navy `#2e3a8c`, soft primary `#eef0fb`, line `#e4e5f0`, red `#c23b3b`
   - same gradients, glass, soft/glow shadows
   - dark mode inverted exactly as in the reference
   - keep the existing editorial article styles (they already read from tokens, so they recolor automatically)

2. **Tailwind config** — port the reference `tailwind.config.ts` additions, notably the `violet` scale override remapped onto the navy brand. 30 files in this project use `violet-*` classes; overriding the scale retints them all at once without touching each file.

3. **Hardcoded colors** — replace the remaining literal values that bypass the theme, page by page:
   - `hsl(222,47%,11%)` blocks (SoftPaywallBanner, AeoOpportunities, sidebars, checkout box, etc.) → `bg-primary` / `text-primary-foreground`
   - `text-white` / `bg-black` on non-image surfaces → semantic tokens
   - landing/blog/legal pages (Index, About, Blog, Privacy, Terms, Connect, AiSeo, GeoEngineLanding, GeoSuccessMetrics, PublicFooter, Pricing, Signup, Auth) get the same treatment so the public site and the app match

4. **Typography** — keep the Inter + Syne/Fraunces loading already used by both projects; align the font tokens with the reference.

## Scope note

This is a presentation-only pass: no logic, data, or route changes. Component structure stays as-is; only colors, tokens, and class names change.

## Question of record

The landing page is currently dark (`#0a0a0f`) by project convention. The plan unifies it onto the same light v4 theme as the reference repo. If you want the landing to stay dark, say so and I will keep it dark while still swapping its accents to the navy brand.
