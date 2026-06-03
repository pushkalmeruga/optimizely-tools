# Optimizely Tools

VS Code extension for building and pushing the current JavaScript, SCSS, or CSS file to Optimizely Web Experimentation.

## Features ✨

- Adds a `Push to Optimizely` editor title button for `.js`, `.scss`, and `.css` files.
- Builds JavaScript through webpack as browser ES2015 output before pushing.
- Compiles SCSS through webpack and pushes the generated CSS.
- Stores your Optimizely personal or OAuth access token in VS Code Secret Storage.
- Confirms the selected project, experiment, target, file type, and file path before every push.
- Supports shared experiment JS/CSS and variation JS/CSS targets.

## Configuration

This extension provides the following settings in VS Code:

- `optimizelyTools.defaultProjectId`: A default Optimizely Project ID to use if not specified in the file.
- `optimizelyTools.apiBaseUrl`: Base URL for the Optimizely REST API. Defaults to `https://api.optimizely.com`.
- `optimizelyTools.publishOnPush`: If `true`, automatically publishes the experiment after pushing code changes. Defaults to `false`.
- `optimizelyTools.overrideDrafts`: If `true`, forces the update even if Optimizely reports a draft conflict. Defaults to `false`.

## Running for Development

To run and debug the extension locally:

1.  **Install Dependencies**: Open a terminal in the project root and run `npm install`.
2.  **Build the Extension**: Run `npm run package` to compile and bundle the extension.
    - For active development, you can run `npm run watch` in a terminal to automatically re-build the extension whenever you save a file.
3.  **Start Debugging**: Press `F5` in VS Code. This will open a new "[Extension Development Host]" window with your extension loaded.
4.  **Configure Token**: In the new window, open the Command Palette (`View > Command Palette...`) and run the `Optimizely: Save API Token` command. Paste your Optimizely API token when prompted.
5.  **Push a File**: Open a `.js`, `.scss`, or `.css` file. You can now use the `Push to Optimizely` command, which is available from:
    - The Optimizely icon (`$(optimizely-icon)`) in the editor's title bar.
    - The right-click context menu in the editor or file explorer.
    - The Command Palette.

**Important**: For the extension to work, ensure your `.js`, `.scss`, or `.css` file includes the `Project Id` and `Experiment Id` in comments within the first 15 lines. For example:

```javascript
// Project Id: 12345
// Experiment Id: 67890
// Variation Id: 123
```

## API Notes

The extension uses Optimizely Web Experimentation REST API v2:

- `GET /v2/experiments/{experiment_id}`
- `GET /v2/pages/{page_id}`
- `PATCH /v2/experiments/{experiment_id}`

Optimizely documents Bearer-token authentication and experiment-level `changes`. Variation custom code is represented inside an experiment's variation objects; this extension updates matching existing custom JS/CSS changes when available and creates a conventional custom code change when no match exists.
