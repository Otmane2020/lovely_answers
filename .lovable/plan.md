# Adopt the "lovelyanswers" v4 theme everywhere

The reference repo has the same app structure as this one. Its new look ("AutoPilot GEO v4") comes from a new set of colors, fonts, and restyled shared components. Pages and features stay the same.

## What changes visually
- Colors: soft paper background (#f5f6fb), deep navy ink text (#14162e), indigo primary (#2e3a8c), light lines (#e4e5f0), soft indigo accents. Matching dark mode.
- Fonts: Syne (titles), Fraunces (accents), DM Mono (numbers/code), Inter (body text), same as the reference.
- Softer shadows, glass cards, indigo gradient buttons.
- Applied to dashboard, admin, checkout, auth, onboarding, landing, and blog.

## Steps
1. Copy the reference global stylesheet: color tokens for light and dark, gradients, shadows, glass effects, and helper classes.
2. Copy the reference Tailwind config (colors, fonts, radius, animations).
3. Sync font loading in index.html.
4. Copy the restyled shared UI components (`src/components/ui/*`) and the layout pieces (sidebar, header, PageHeader) where they differ. No logic changes.
5. Remove hardcoded colors on the landing (#0a0a0f) and blog (#f8f7f4) so they use the shared theme.
6. Update the project memory: replace the old "Landing dark / Blog light" rule with the v4 theme.
7. Check the main pages in the preview with screenshots: landing, dashboard, blog, checkout.

## Technical details
- Source: raw files from `github.com/Otmane2020/lovelyanswers` (main branch), diffed file by file against this project.
- Only presentation files change: `src/index.css`, `tailwind.config.ts`, `index.html` fonts, `src/components/ui/*`, `src/components/layout/*`. Nothing changes in the backend, data, or business logic.
- If a reference component's API differs from ours (props), keep our API and port only the styles.
