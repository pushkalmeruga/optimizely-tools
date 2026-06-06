# Change Log

All notable changes to the "Optimizely Tools" extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.5] - 2026-06-06

### Fixed

- Re-enabled esbuild tree-shaking (reverting the 0.1.4 change). Disabling it
  caused every export of an imported module to be bundled into the output, so a
  file importing from a shared utility library pulled in all of its unused
  helpers (cookie helpers, DOM waiters, etc.). With tree-shaking on, only the
  imported symbols actually used are included, while the entry file's own
  top-level code is preserved because it is reachable from the bootstrap
  side effects.

### Changed

- JavaScript is now pushed as readable, indented output instead of minified
  code, so it can be debugged directly in browser dev tools. Imports are still
  bundled and unused imports tree-shaken; only the whitespace/syntax
  minification was removed.

## [0.1.4] - 2026-06-06

### Changed

- Disabled esbuild tree-shaking when bundling JavaScript. This was intended to
  stop unused-looking declarations from being dropped, but it regressed bundling:
  unused exports from imported modules were no longer eliminated. Reverted in
  0.1.5.

## [0.1.3] - 2026-06-05

### Changed

- Replaced the runtime webpack/Babel/Terser build with in-process `esbuild-wasm`
  (JavaScript) and Dart Sass (SCSS). No subprocess is spawned to compile code.
- Shrunk the packaged extension from ~6288 files to ~190, resolving the VS Code
  "should bundle your extension" packaging warning. JavaScript output is now
  minified by esbuild (identifier names preserved); SCSS is compiled to expanded
  CSS as before, and plain CSS is still pushed verbatim.

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
