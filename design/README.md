# Dailyo design system

The app uses the approved Block Party direction: dark navy boards, recessed
playfields, coloured answer pieces, and quiet navigation. Dark mode is a product
requirement, regardless of the device's colour preference.

## Ownership

- `tokens.json` owns design values: colours, type, spacing, radii, strokes,
  layout measures, effects, shadows, motion and breakpoints.
- `scopes.json` declares recipes that must resolve on a component, such as coloured
  piece shadows.
- `styles/playroom.css` owns shared component presentation and interaction states.
- The other files in `styles/` own the existing game layouts and content-specific
  presentation. Their public stylesheet URLs and cascade order are preserved.
- `../src/design.ts` lets canvas renderers read the same CSS tokens. It reads the
  element's computed style so embedded games can inherit their host surfaces.
- `../dist/*.css` and `../src/design-token-names.ts` are generated outputs.

Edit the authored files, then run `bun run design:build`. `bun run design:check`
rejects bypasses and stale generated output. The normal build and lint commands
include these checks.

## Choosing values

Use a semantic role before choosing a colour. `--paper`, `--panel` and `--well`
are the page, board and recessed playfield. `--ink` and `--muted` are the text
hierarchy. Accent, focus, success and error have separate roles. The four piece
colours identify answer positions; correct and missed states override them.
Map route colours supplied by transit datasets remain data, rather than theme
tokens. Never convert route identity into the four answer colours.

Use the four-pixel spacing scale: `--space-2` (8px) between related items,
`--space-4` (16px) between groups, and `--space-6` (24px) between sections.
Use `size` and `layout` measures for control sizes and puzzle geometry, rather
than treating those values as spacing. Existing optical details such as the
action's top/bottom padding and subway connector offsets have named measures.
New ordinary spacing must use the spacing scale.

The `compatibility` group preserves exact historical colours still referenced by
older game rules. It prevents this infrastructure change from repainting the UI.
Use the Block Party semantic roles for new work; update the shared component
owner when retiring a compatibility value.

Type uses SF Pro, regular or medium, with six sizes: 12, 13, 14, 16, 18 and 24px.
13px is the base. Use the named radius, shadow and motion recipes. Keep animation
under the existing reduced-motion media queries. Named `breakpoint(mobile)`
references are expanded during the build because CSS variables do not work in
media-query conditions.

Relative layout (`100%`, fractions, aspect ratios, `auto`, zero), game coordinates,
answers, scores and data-derived positions are not theme values. Literal design
colours and absolute CSS measures belong in tokens. Runtime CSS properties are
limited to the registered component properties in the checker.

## Shared components

Use the existing class contracts instead of introducing a second button or board.
These are plain CSS and DOM components; the app does not require a UI framework.

| Component          | Contract                                                    | States                                                  |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------- |
| Primary action     | `.primary`, `.primary-button`                               | hover, focus, pressed, disabled                         |
| Secondary action   | `.secondary`, `.secondary-button`                           | hover, focus, disabled                                  |
| Answer piece       | `.choice`                                                   | default, hover, pressed, `.correct`, `.wrong`, disabled |
| Sort piece         | `.swap-tile` inside `.swap-board`                           | hover, pressed, `[aria-pressed=true]`                   |
| Board and question | `.main`, `.prompt`, `.visual-viewport`, `.perception-field` | standalone and embedded                                 |
| Progress           | `.daily-progress`, `.progress-dot`                          | `.current`, `.correct`, `.incorrect`                    |
| Navigation         | `.site-masthead`, `.site-modes`, `.site-more`               | current route, expanded, focus                          |
| Help               | `.game-help-dialog`, `.game-help-header`                    | native dialog, backdrop, return focus                   |
| Results            | `.result`, `.result-actions`, `.answer-review`              | completion, review, replay                              |
| Rush               | `.feed-actions`, `.rush-track`, `.streak-block`             | untimed, timed, paused, feedback, recap                 |

Answer pieces set `--piece` and `--lip` locally. Their `--shadow-answer` recipe
is scoped to the piece in `scopes.json`, where its selected lip colour is
available. A shadow defined on the root would resolve too early and lose the
orange/violet/teal lips.
Other contextual properties are `--reward-accent`, `--route-color` and the
data-derived `--rush-remaining`. Embedded games may select `--paper` and `--panel`
from the existing surface tokens.

## Changing the system

1. Reuse an existing component and role.
2. If the behavior is new, add a shared state or variant at its owner.
3. If a value is missing, explicitly add a meaningfully named token to
   `tokens.json`. Explain its purpose and relationship to the existing scale in
   the change. Do not add a token merely to disguise a one-off value.
4. Rebuild, run the design contract checks, and inspect the affected game states
   on mobile and desktop. Check keyboard operation, zoom and reduced motion.
5. Run the existing Lintapple and dark-default regressions. Record actual
   findings; a passing token check does not establish visual quality.

Do not add feature-local stylesheets, inline style blocks, arbitrary utility
values or literal canvas paints. Update this contract when a new component or
runtime custom property is introduced.
