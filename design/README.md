# Dailyo design system

The approved Block Party UI stays dark under both system colour preferences.

## Owners

| File                    | Owns                                                                             |
| ----------------------- | -------------------------------------------------------------------------------- |
| `tokens.json`           | Shared semantic colours, type, spacing, radii, motion and layout limits          |
| `styles/components.css` | Shared controls, navigation, boards, help and results; their states and variants |
| `styles/games.css`      | Puzzle layout and game geometry                                                  |
| `styles/subway.css`     | Rail maps, route editing and city navigation                                     |
| `styles/feed.css`       | Daily/Rush hosting, clocks and progression layout                                |

Each value has the smallest useful scope. Reuse shared tokens for ordinary text,
controls, surfaces and spacing. A game's own geometry belongs with that game;
it does not become a global `size-136` token. Piece colours, optical offsets and
component effects are named private properties declared on their owning component.
There is no second compatibility palette or separate scope configuration.

## Use and extend

1. Reuse an existing component or variant. Primary/secondary actions retain the
   existing `.primary`/`.primary-button` and `.secondary`/`.secondary-button` aliases.
2. Use `--space-2` (8px) between related items, `--space-4` (16px) between groups
   and `--space-6` (24px) between sections. Type uses SF Pro, regular/medium, and
   the 12/13/14/16/18/24px scale.
3. Add a shared token only for a decision that belongs across components. For a
   component-specific decision, declare a descriptive private property at its
   owner and reference it from the rule. Its name must identify that component:

   ```css
   .angle-board {
     --angle-board-max-width: 480px;
     width: min(100%, var(--angle-board-max-width));
     background: var(--well);
   }
   ```

4. Put a shared control's base, interaction states and variants together in
   `components.css`. Game files may arrange controls but cannot repaint them.
   Ownership is derived from the shared component selectors, so introducing a
   component does not require another registry entry.
5. Run `bun run design:build`, `bun run design:check`, and the affected browser/UI
   checks. Inspect mobile, desktop, keyboard, feedback and recovery states.

Native CSS resolves recipes on the component. In particular, answer faces and
lips are selected through `--answer-face` and `--answer-lip` on the pieces; their
shadow is defined there too. Values never resolve prematurely at the root.

`src/design.ts` exposes `designValue()` for canvas paint and the small set of
shared measurements needed by layout code. Its token names are generated as
TypeScript declarations. Game coordinates, answers, aspect ratios, content-based
`ch` measures and data-derived positions remain game data. Transit route colours
remain network data. Runtime custom properties are limited to `--route-color`
and `--rush-remaining`.

## Build and enforcement

PostCSS parses declarations and media queries; value and selector parsers handle
references and ownership. Checks reject raw design values outside named
component definitions, unknown references, cycles, game-level repainting of
shared controls, extra stylesheets, inline HTML styles and stale generated output.
Comments and strings are not treated as CSS declarations.

The build emits shared tokens, shared components and one layout stylesheet per
page family. `dist/*.css` and `src/design-token-names.d.ts` are generated. Edit
only their authored owners. `breakpoint(mobile)` is expanded from the shared
breakpoint table because CSS variables cannot be used in media-query conditions.

`bun run test:design` exercises the real CLI, including rejected bypasses and
successful component extensions. `bun run test:design:e2e` proves CSS and canvas
consume the same tokens. The existing Playroom and dark-theme suites protect
interaction and dark defaults. A token check is not a visual or editorial review.
