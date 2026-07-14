# Change Log

All notable changes to the "Optimizely Tools" extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.13] - 2026-07-14

### Fixed

- Bare package-name imports (e.g. `import "my-package/carousel"`) that
  resolve through a `package.json` `exports` map now build correctly even
  when the file being pushed lives outside that package's own directory
  tree. Previously only Node's self-referencing resolution applied, which
  requires the importing file to be nested under the package root.

## [0.1.11] - 2026-07-08

### Changed

- Replaced the `optimizelyTools.publishOnPush` setting with a per-push choice.
  The push confirmation dialog now offers "Push" and "Push & Publish" buttons
  (or "Push Anyway" / "Push Anyway & Publish" when validation warnings exist),
  so publishing is decided on each push instead of a fixed global setting.

### Removed

- Setting `optimizelyTools.publishOnPush`.

## [0.1.10] - 2026-06-15

### Changed

- Each identifier flagged in the push confirmation now lists the line number(s)
  where it appears (e.g. `getUUID (line 12)`, `safeFn (lines 9, 14)`).

### Fixed

- The validation push confirmation now reliably renders as a red error dialog.
  The severity method was previously invoked without its `vscode.window`
  receiver, which could prevent the error styling from being applied.

## [0.1.9] - 2026-06-15

### Added

- Undefined references are now also shown as red error diagnostics (squiggles in
  the editor and rows in the Problems panel) on the exact identifier, refreshed
  when a JavaScript file is opened or saved. Diagnostics appear only for
  Optimizely-targeted files (those declaring an `Experiment Id` in their
  metadata), so unrelated workspace scripts are never flagged.

### Changed

- Validation now analyzes the source file directly (parsed as an ES module with
  a plain-script fallback) rather than the bundled output, so findings map to
  exact editor positions.
- When validation flags issues, the push confirmation is shown as an error
  dialog (red icon) instead of a warning dialog.

## [0.1.8] - 2026-06-08

### Added

- Pre-push validation for JavaScript. Before pushing, the compiled bundle is
  statically analyzed and any identifier that is referenced but never declared,
  imported, or recognized as a runtime global (browser/DOM, language built-ins,
  and common analytics globals) is reported as "possibly undefined" — catching
  typos and missing imports (e.g. `getUUID`, `safeFn`). The confirmation dialog
  lists the suspect names and switches its button to "Push Anyway" so broken
  code is not pushed on a single default click.
- Setting `optimizelyTools.validateBeforePush` (default `true`) to toggle the
  check, and `optimizelyTools.knownGlobals` to allowlist extra page-provided
  globals that should not be flagged.

## [0.1.7] - 2026-06-08

### Changed

- When a file has no Variation ID but declares `Variation: Shared` (case
  insensitive) in its comments, the code is now pushed to the experiment's
  shared code without prompting for a target. Any other variation name (or no
  variation comment) still shows the target/variation prompts.

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
- When a file specifies a Variation ID, the push now goes straight to that
  variation without prompting for the target or variation. The page is still
  asked for only when the experiment has multiple pages. If no Variation ID is
  present (or it is invalid for the experiment), the target/variation prompts
  are shown as before.
- The confirmation dialog now shows the selected page name when a page was
  chosen from the multi-page picker.

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
