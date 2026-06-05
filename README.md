# Optimizely Tools

Build and push JavaScript, SCSS, and CSS files from VS Code directly to Optimizely Web Experimentation.

> **Unofficial extension.** This is a community project and is **not affiliated with, endorsed by, or sponsored by Optimizely, Inc.** "Optimizely" is a trademark of its respective owner.

## Features

- Push `.js`, `.scss`, and `.css` files from the editor title bar, editor context menu, explorer context menu, or command palette.
- Bundle and minify JavaScript with esbuild before pushing, targeting browser ES2015.
- Compile SCSS to CSS with Dart Sass and push the generated CSS.
- Push shared experiment JS/CSS or variation JS/CSS.
- Store your Optimizely API token securely in VS Code Secret Storage.
- Confirm the project, experiment, target, and source file before every push.

## Installation

Install **Optimizely Tools** from the VS Code Marketplace:

- In VS Code: open the Extensions view (`Cmd`/`Ctrl`+`Shift`+`X`), search for **Optimizely Tools**, and click **Install**.
- Or from the command line:

  ```bash
  code --install-extension pushkalmeruga.optimizely-tools
  ```

## Getting Started

1. Run **`Optimizely: Save API Token`** from the command palette (`Cmd`/`Ctrl`+`Shift`+`P`) and paste your Optimizely Web Experimentation API token.
2. Open a `.js`, `.scss`, or `.css` file and add the Optimizely IDs in the first 15 lines (see [File Metadata](#file-metadata)).
3. Run **`Push to Optimizely`** from the editor title bar, right-click menu, or command palette.

To remove a stored token later, run **`Optimizely: Remove API Token`**.

## File Metadata

Each source file must include Optimizely IDs in the first 15 lines.

```javascript
// Project Id: 12345
// Experiment Id: 67890
// Variation Id: 111222333
```

`Project Id` can be omitted if `optimizelyTools.defaultProjectId` is set in VS Code settings.

`Variation Id` is optional. If it is missing, the extension asks which variation to update.

## Push Behavior

Shared experiment code:

- Does not use a page ID.
- Updates experiment-level `changes`.
- Sends the full experiment payload back to Optimizely with updated shared code.

Variation code:

- Always resolves a page ID before pushing.
- If root `page_ids` has one page, that page is used automatically.
- If root `page_ids` has multiple pages, the extension asks which page to update.
- If root `page_ids` is not available, page IDs are resolved from variation actions and `url_targeting`.
- Updates the existing `actions[]` object with the selected `page_id`.
- Creates a new action with `{ page_id, changes: [...] }` when no action exists for the selected page.

Code changes:

- `.js` pushes as `custom_code`.
- `.scss` and `.css` push as `custom_css`.
- Existing Optimizely change IDs are removed from PATCH payloads because they are read-only.

## Configuration

- `optimizelyTools.defaultProjectId`: default project ID when the file does not include `Project Id`.
- `optimizelyTools.apiBaseUrl`: Optimizely REST API base URL. Defaults to `https://api.optimizely.com`.
- `optimizelyTools.publishOnPush`: adds `action=publish` to the update request.
- `optimizelyTools.overrideDrafts`: adds `override_changes=true` to the update request.

## API Endpoints

The extension uses Optimizely Web Experimentation REST API v2:

- `GET /v2/experiments/{experiment_id}`
- `GET /v2/pages/{page_id}`
- `PATCH /v2/experiments/{experiment_id}`

---

## Development

These steps are for contributors working on the extension itself. End users do **not** need them — installing from the Marketplace is enough.

### Run from source

1. Run `npm install`.
2. Run `npm run package`.
3. Press `F5` in VS Code to open an Extension Development Host.
4. In that window, run `Optimizely: Save API Token`, then open a file and run `Push to Optimizely`.

### Commands

- `npm run compile`: bundle the extension into `dist/extension.js`.
- `npm run watch`: rebuild on source changes.
- `npm run lint`: lint the TypeScript source.
- `npx tsc --noEmit`: type-check the extension.

### Packaging & publishing

Packaging requires Node 20+ (`vsce` does not support older versions).

```bash
npx vsce package    # build a local .vsix to test
npx vsce publish    # publish to the Marketplace (requires a publisher PAT)
```

> The extension compiles user code at runtime with `esbuild-wasm` and `sass`, so
> those dependencies must ship inside the VSIX. Do **not** package with
> `--no-dependencies`.

## License

[MIT](LICENSE)
