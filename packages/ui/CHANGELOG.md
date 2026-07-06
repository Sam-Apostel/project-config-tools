# @apostel/visual-config-ui

## 0.1.1

### Patch Changes

- [#4](https://github.com/Sam-Apostel/project-config-tools/pull/4) [`2e4f32d`](https://github.com/Sam-Apostel/project-config-tools/commit/2e4f32ddd009bf6b5f555b77e627fd3480b4fab9) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - Script runner improvements in the browser UI:

  - The output terminal now renders with a **JetBrains Mono Nerd Font** stack (falls
    back to plain JetBrains Mono / system mono), so glyph/powerline output from
    scripts displays correctly.
  - Added a **Stop** button for running scripts — in each script's row and above its
    live output — so a UI-launched process (e.g. a dev server) can be terminated from
    the UI instead of being orphaned. It calls the existing `stopScript` (SIGTERM).

## 0.1.0
