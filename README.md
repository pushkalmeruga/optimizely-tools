# Optimizely Tools

Build and push JavaScript, SCSS, and CSS files from VS Code to Optimizely Web Experimentation.

## Features

- Push `.js`, `.scss`, and `.css` files from the editor title, editor context menu, explorer context menu, or command palette.
- Build JavaScript through webpack before pushing, with browser ES2015 output.
- Compile SCSS through webpack and push the generated CSS.
- Push shared experiment JS/CSS or variation JS/CSS.
- Store the Optimizely token in VS Code Secret Storage.
- Confirm the project, experiment, target, and source file before every push.

## Setup

1. Run `npm install`.
2. Run `npm run package`.
3. Press `F5` in VS Code to open an Extension Development Host.
4. Run `Optimizely: Save API Token` from the command palette.
5. Open a `.js`, `.scss`, or `.css` file and run `Push to Optimizely`.

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

## Development Commands

- `npm run package`: bundle the extension into `dist/extension.js`.
- `npm run watch`: rebuild on source changes.
- `npm run lint`: lint TypeScript source.
- `npx tsc --noEmit`: type-check the extension.

## API Endpoints

The extension uses Optimizely Web Experimentation REST API v2:

- `GET /v2/experiments/{experiment_id}`
- `GET /v2/pages/{page_id}`
- `PATCH /v2/experiments/{experiment_id}`

## Publishing Prep

Before publishing to the VS Code Marketplace:

- Replace the local `publisher` value in `package.json`.
- Add marketplace metadata such as repository, license, keywords, and icon if needed.
- Run `npm run package`, `npm run lint`, and `npx tsc --noEmit`.
- Package with `vsce package` and test the generated `.vsix` in a clean VS Code profile.
