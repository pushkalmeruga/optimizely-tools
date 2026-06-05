# Change Log

All notable changes to the "Optimizely Tools" extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.1] - 2026-06-05

### Changed

- Replaced the extension and toolbar icons with original artwork (no longer uses
  the official Optimizely logo).

## [0.1.0] - 2026-06-05

### Added

- Push `.js`, `.scss`, and `.css` files to Optimizely Web Experimentation from the
  editor title bar, editor context menu, explorer context menu, or command palette.
- Build JavaScript through webpack (browser ES2015 output) before pushing.
- Compile SCSS through webpack and push the generated CSS.
- Support for shared experiment JS/CSS and variation JS/CSS.
- Store the Optimizely API token in VS Code Secret Storage
  (`Optimizely: Save API Token` / `Optimizely: Remove API Token`).
- Confirmation of project, experiment, target, and source file before every push.
- Settings: `defaultProjectId`, `apiBaseUrl`, `publishOnPush`, `overrideDrafts`.
