---
'@apostel/visual-config-ui': patch
---

Script runner improvements in the browser UI:

- The output terminal now renders with a **JetBrains Mono Nerd Font** stack (falls
  back to plain JetBrains Mono / system mono), so glyph/powerline output from
  scripts displays correctly.
- Added a **Stop** button for running scripts — in each script's row and above its
  live output — so a UI-launched process (e.g. a dev server) can be terminated from
  the UI instead of being orphaned. It calls the existing `stopScript` (SIGTERM).
