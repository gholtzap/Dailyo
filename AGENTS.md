# Dailyo product requirements

- The game must always open in dark mode, including when the device prefers light mode. Preserve dark backgrounds, native controls, browser theme color, dialogs, and embedded Daily/Rush games.
- Do not switch this product to a light palette or change its dark default unless Gavin explicitly requests that change. Layout and interaction redesigns do not authorize a theme change.
- Keep the dark-default browser regression checks in `tests/dark-theme.mjs` and verify mobile and desktop with both system color preferences before publishing theme changes.
