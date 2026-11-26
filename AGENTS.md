# Dailyo product requirements

- The game must always open in dark mode, including when the device prefers light mode. Preserve dark backgrounds, native controls, browser theme color, dialogs, and embedded Daily/Rush games.
- Do not switch this product to a light palette or change its dark default unless Gavin explicitly requests that change. Layout and interaction redesigns do not authorize a theme change.
- Keep the dark-default browser regression checks in `tests/dark-theme.mjs` and verify mobile and desktop with both system color preferences before publishing theme changes.

## UI and editorial review

- Build around the user’s immediate task. Default to omitting additional UI.
- Every visible element must help the user act, understand necessary state, or recover from a problem.
- Remove copy that narrates an obvious action, repeats a label, explains the screen the user is already seeing, or defends the implementation.
- Keep secondary rules and provenance in Help or Source. Express results through clear values and visual comparisons.
- Before publishing, inspect every affected state on mobile and desktop. Apply the same critical standard you would use if Gavin explicitly asked you to identify every piece of AI slop. Fix those findings before calling the work complete. Passing functional and accessibility checks does not replace this editorial review.
- Preserve approved design decisions, including dark mode. Treat corrections as principles that apply across related screens.

## Design system contract

- Read `design/README.md` before changing presentation. `design/tokens.json` owns design values; `design/styles/` owns authored CSS. The CSS in `dist/` is generated.
- Reuse the shared components and states in `design/styles/playroom.css`. Add a named token or shared variant explicitly when the system needs to grow. Do not invent feature-local colours, spacing, typography, radii, shadows, or motion values.
- Canvas paints must use `designValue()` from `src/design.ts`. Game coordinates and transit route colours remain data.
- Run `bun run design:build` after design changes and `bun run design:check` before completion. Do not bypass the checker or hide a one-off value behind a meaningless token.
