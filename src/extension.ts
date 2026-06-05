import * as vscode from "vscode";
import * as https from "node:https";
import * as http from "node:http";
import { URL } from "node:url";
import * as childProcess from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

interface OptimizelyFileIds {
  projectId?: number;
  experimentId?: number;
  variationId?: number;
}

const TOKEN_KEY = "optimizelyTools.apiToken";
const FILE_ID_SCAN_LINES = 15;
const WEBPACK_OUTPUT_BUFFER_BYTES = 1024 * 1024 * 5;
const WEBPACK_TEMP_DIR_PREFIX = "optimizely-tools-webpack-";
const execFile = promisify(childProcess.execFile);

type CodeKind = "javascript" | "css";
type TargetKind = "shared" | "variation";

interface OptimizelyProject {
  id: number;
  name: string;
}

interface OptimizelyPage {
  id: number;
  name: string;
}

interface OptimizelyExperiment {
  id: number;
  name: string;
  project_id?: number;
  status?: string;
  variations?: OptimizelyVariation[];
  changes?: OptimizelyChange[];
  page_ids?: number[];
  url_targeting?: unknown;
  [key: string]: unknown;
}

interface OptimizelyAction {
  page_id?: number | string;
  changes?: OptimizelyChange[];
  [key: string]: unknown;
}

interface OptimizelyVariation {
  variation_id: number;
  name?: string;
  key?: string;
  weight?: number;
  changes?: OptimizelyChange[];
  actions?: OptimizelyAction[];
}

interface OptimizelyChange {
  id?: string | number;
  type?: string;
  value?: unknown;
  async?: boolean;
  page_id?: number;
  dependencies?: unknown[];
  [key: string]: unknown;
}

interface PushTarget {
  kind: TargetKind;
  codeKind: CodeKind;
  variation?: OptimizelyVariation;
}

export function activate(context: vscode.ExtensionContext): void {
  const client = new OptimizelyClient(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("optimizelyTools.signIn", () =>
      saveToken(context),
    ),
    vscode.commands.registerCommand("optimizelyTools.signOut", () =>
      removeToken(context),
    ),
    vscode.commands.registerCommand(
      "optimizelyTools.pushCurrentFile",
      (uri?: vscode.Uri) => pushCurrentFile(context, client, uri),
    ),
  );
}

export function deactivate(): void {
  // VS Code disposes registered subscriptions from the extension context.
}

async function saveToken(context: vscode.ExtensionContext): Promise<void> {
  const token = await vscode.window.showInputBox({
    title: "Optimizely API Token",
    prompt:
      "Paste a personal token or OAuth access token. It will be stored in VS Code Secret Storage.",
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() ? undefined : "Token is required."),
  });

  if (!token) {
    return;
  }

  await context.secrets.store(TOKEN_KEY, token.trim());
  vscode.window.showInformationMessage("Optimizely token saved.");
}

async function removeToken(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(TOKEN_KEY);
  vscode.window.showInformationMessage("Optimizely token removed.");
}

async function pushCurrentFile(
  context: vscode.ExtensionContext,
  client: OptimizelyClient,
  uri?: vscode.Uri,
): Promise<void> {
  const document = await resolveDocument(uri);
  if (!document) {
    return;
  }

  const codeKind = getCodeKind(document);
  if (!codeKind) {
    vscode.window.showWarningMessage(
      "Only JavaScript, SCSS, and CSS files can be pushed to Optimizely.",
    );
    return;
  }

  if (!(await ensureToken(context))) {
    return;
  }

  const token = await context.secrets.get(TOKEN_KEY);
  if (!token) {
    return;
  }

  const fileIds = parseIdsFromFile(document);
  const config = vscode.workspace.getConfiguration("optimizelyTools");
  const projectId = fileIds.projectId ?? config.get<number>("defaultProjectId");
  const { experimentId, variationId } = fileIds;

  if (document.isDirty) {
    const choice = await vscode.window.showWarningMessage(
      "This file has unsaved changes. Push the editor contents as shown in VS Code?",
      { modal: true },
      "Push Unsaved Contents",
    );
    if (choice !== "Push Unsaved Contents") {
      return;
    }
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Preparing Optimizely push",
        cancellable: false,
      },
      async (progress) => {
        if (!projectId) {
          throw new Error(
            'Project ID not found. Add it to file comments (e.g., "Project Id: 12345") or set "optimizelyTools.defaultProjectId" in VS Code settings.',
          );
        }
        if (!experimentId) {
          throw new Error(
            'Experiment ID not found. Add it to file comments (e.g., "Experiment Id: 67890") in the first 15 lines of the file.',
          );
        }

        progress.report({ message: `Loading experiment ${experimentId}...` });
        let completeExperiment: OptimizelyExperiment;
        try {
          completeExperiment = await client.getExperiment(token, experimentId);
        } catch (error: unknown) {
          if (
            error instanceof Error &&
            (error.message.includes("404") ||
              error.message.includes("Not Found"))
          ) {
            throw new Error(
              `Experiment with ID ${experimentId} not found or you lack permissions. Please verify the ID.`,
            );
          }
          throw error;
        }

        // Validate that the found experiment belongs to the specified project.
        if (completeExperiment.project_id !== projectId) {
          throw new Error(
            `Experiment ${experimentId} does not belong to Project ${projectId}. (It was found in Project ${completeExperiment.project_id}). Please correct the IDs in your file.`,
          );
        }

        const target = await pickTarget(
          completeExperiment,
          codeKind,
          variationId,
        );
        if (!target) {
          return;
        }

        let pageId: number | undefined;

        if (target.kind === "variation") {
          progress.report({ message: "Resolving page..." });
          pageId = await pickPage(client, token, completeExperiment);
          if (!pageId) {
            return; // User cancelled or no pages found
          }
        }

        const pseudoProject: OptimizelyProject = {
          id: projectId,
          name: `Project ${projectId}`,
        };
        const confirmed = await confirmPush(
          pseudoProject,
          completeExperiment,
          target,
          document,
        );
        if (!confirmed) {
          return;
        }

        progress.report({ message: "Building with webpack..." });
        const compiledCode = await buildCodeForPush(
          context,
          document,
          target.codeKind,
        );
        const payload = buildExperimentPatch(
          completeExperiment,
          target,
          compiledCode,
          pageId,
        );

        progress.report({ message: "Pushing code..." });
        await client.updateExperiment(token, completeExperiment.id, payload);
        vscode.window.showInformationMessage(
          `Pushed ${target.codeKind.toUpperCase()} to ${describeTarget(target)} in "${completeExperiment.name}".`,
        );
      },
    );
  } catch (error) {
    vscode.window.showErrorMessage(formatError(error));
  }
}

function parseIdsFromFile(document: vscode.TextDocument): OptimizelyFileIds {
  const lineCount = Math.min(document.lineCount, FILE_ID_SCAN_LINES);
  const text = document.getText(new vscode.Range(0, 0, lineCount, 0));
  const ids: OptimizelyFileIds = {};

  const projectIdMatch = text.match(/Project Id:\s*(\d+)/i);
  if (projectIdMatch?.[1]) {
    ids.projectId = parseInt(projectIdMatch[1], 10);
  }

  const experimentIdMatch = text.match(/Experiment Id:\s*(\d+)/i);
  if (experimentIdMatch?.[1]) {
    ids.experimentId = parseInt(experimentIdMatch[1], 10);
  }

  const variationIdMatch = text.match(/Variation Id:\s*(\d+)/i);
  if (variationIdMatch?.[1]) {
    ids.variationId = parseInt(variationIdMatch[1], 10);
  }

  return ids;
}

async function resolveDocument(
  uri?: vscode.Uri,
): Promise<vscode.TextDocument | undefined> {
  if (uri) {
    return vscode.workspace.openTextDocument(uri);
  }

  const active = vscode.window.activeTextEditor?.document;
  if (active) {
    return active;
  }

  vscode.window.showWarningMessage(
    "Open a JavaScript, SCSS, or CSS file before pushing to Optimizely.",
  );
  return undefined;
}

function getCodeKind(document: vscode.TextDocument): CodeKind | undefined {
  const fileName = document.fileName.toLowerCase();
  if (fileName.endsWith(".js")) {
    return "javascript";
  }
  if (fileName.endsWith(".css")) {
    return "css";
  }
  if (fileName.endsWith(".scss")) {
    return "css";
  }
  return undefined;
}

async function buildCodeForPush(
  context: vscode.ExtensionContext,
  document: vscode.TextDocument,
  codeKind: CodeKind,
): Promise<string> {
  const sourceExtension = path.extname(document.fileName).toLowerCase();
  const sourceBaseName = path.basename(document.fileName, sourceExtension);
  const outputExtension = codeKind === "javascript" ? ".js" : ".css";
  const outputFileName = `${safeWebpackFileName(sourceBaseName)}${outputExtension}`;
  const outputDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), WEBPACK_TEMP_DIR_PREFIX),
  );
  let entryPath = document.fileName;
  let temporaryEntryPath: string | undefined;

  try {
    if (document.isDirty) {
      temporaryEntryPath = path.join(
        path.dirname(document.fileName),
        `.optimizely-tools-${Date.now()}-${safeWebpackFileName(sourceBaseName)}${sourceExtension}`,
      );
      entryPath = temporaryEntryPath;
      await fs.writeFile(temporaryEntryPath, document.getText(), "utf8");
    }

    const webpackEntry = getWebpackEntry(context.extensionPath);
    const webpackConfig = path.join(context.extensionPath, "webpack.config.js");
    const args = [
      "--config",
      webpackConfig,
      "--env",
      `entry=${entryPath}`,
      "--env",
      `destination=${outputDirectory}`,
      "--env",
      `filename=${outputFileName}`,
    ];

    await execFile(process.execPath, [webpackEntry, ...args], {
      cwd: context.extensionPath,
      env: {
        ...process.env,
        // Run VS Code's bundled Electron binary as a plain Node process so we
        // can invoke webpack's JS entry directly. We can't rely on
        // node_modules/.bin/webpack because vsce strips those symlinks when
        // packaging the extension.
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "production",
      },
      maxBuffer: WEBPACK_OUTPUT_BUFFER_BYTES,
    });

    const outputPath = path.join(outputDirectory, outputFileName);
    return await fs.readFile(outputPath, "utf8");
  } catch (error) {
    throw new Error(`Webpack build failed. ${formatProcessError(error)}`);
  } finally {
    if (temporaryEntryPath) {
      await fs.rm(temporaryEntryPath, { force: true });
    }
    await fs.rm(outputDirectory, { force: true, recursive: true });
  }
}

function getWebpackEntry(extensionPath: string): string {
  return path.join(
    extensionPath,
    "node_modules",
    "webpack",
    "bin",
    "webpack.js",
  );
}

function safeWebpackFileName(fileName: string): string {
  return (
    fileName.replace(/[^a-z0-9._-]/gi, "-").replace(/^-+|-+$/g, "") ||
    "optimizely-code"
  );
}

function formatProcessError(error: unknown): string {
  if (isExecError(error)) {
    const details = [error.stderr, error.stdout, error.message]
      .filter((value): value is string => Boolean(value?.trim()))
      .join("\n")
      .trim();
    return details || "No webpack output was captured.";
  }

  return formatError(error);
}

function isExecError(
  error: unknown,
): error is Error & { stdout?: string; stderr?: string } {
  return error instanceof Error;
}

async function ensureToken(context: vscode.ExtensionContext): Promise<boolean> {
  const existing = await context.secrets.get(TOKEN_KEY);
  if (existing) {
    return true;
  }

  const choice = await vscode.window.showWarningMessage(
    "An Optimizely API token is required before pushing.",
    "Save Token",
  );
  if (choice !== "Save Token") {
    return false;
  }

  await saveToken(context);
  return Boolean(await context.secrets.get(TOKEN_KEY));
}

async function pickPage(
  client: OptimizelyClient,
  token: string,
  experiment: OptimizelyExperiment,
): Promise<number | undefined> {
  const rootPageIds = uniqueNumbers(experiment.page_ids ?? []);
  if (rootPageIds.length > 0) {
    return pickPageFromIds(client, token, rootPageIds, rootPageIds.length > 1);
  }

  const pageIds = getExperimentPageIds(experiment);

  if (pageIds.length === 0) {
    throw new Error(
      `Cannot create a new code change because no 'page_id' could be found in variation actions, root page_ids, or root url_targeting for experiment "${experiment.name}".`,
    );
  }

  return pickPageFromIds(client, token, pageIds, false);
}

async function pickPageFromIds(
  client: OptimizelyClient,
  token: string,
  pageIds: number[],
  forcePick: boolean,
): Promise<number | undefined> {
  if (!forcePick && pageIds.length === 1) {
    return pageIds[0];
  }

  const pages = await Promise.all(
    pageIds.map((id) => client.getPage(token, id)),
  );

  const pagePick = await vscode.window.showQuickPick(
    pages.map((page) => ({
      label: page.name,
      description: `(ID: ${page.id})`,
      pageId: page.id,
    })),
    {
      title: "Select Page for Code Change",
      placeHolder: "Choose the page to associate this new code change with",
      matchOnDescription: true,
    },
  );

  return pagePick?.pageId;
}

function getExperimentPageIds(experiment: OptimizelyExperiment): number[] {
  const actionPageIds = (experiment.variations ?? [])
    .flatMap((variation) => variation.actions ?? [])
    .map((action) => action.page_id);
  const urlTargetingPageIds = extractPageIds(experiment.url_targeting);

  return uniqueNumbers([...actionPageIds, ...urlTargetingPageIds]);
}

function extractPageIds(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractPageIds(item));
  }

  if (!isRecord(value)) {
    return [];
  }

  const directPageIds = [
    value.page_id,
    ...(Array.isArray(value.page_ids) ? value.page_ids : []),
  ];

  const nestedPageIds = Object.entries(value)
    .filter(([key]) => key !== "page_id" && key !== "page_ids")
    .flatMap(([, nestedValue]) => extractPageIds(nestedValue));

  return uniqueNumbers([...directPageIds, ...nestedPageIds]);
}

function uniqueNumbers(values: unknown[]): number[] {
  return [
    ...new Set(
      values
        .map((value) => (typeof value === "string" ? Number(value) : value))
        .filter(
          (value): value is number =>
            typeof value === "number" && Number.isInteger(value) && value > 0,
        ),
    ),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function pickTarget(
  experiment: OptimizelyExperiment,
  codeKind: CodeKind,
  variationIdFromFile?: number,
): Promise<PushTarget | undefined> {
  const targetPick = await vscode.window.showQuickPick(
    [
      {
        label: "Experiment shared code",
        description: "Runs before all variations",
        value: "shared" as const,
      },
      {
        label: "Variation code",
        description: "Runs for one selected variation",
        value: "variation" as const,
      },
    ],
    {
      title: "Select Optimizely Target",
      placeHolder: "Where should the code be pushed?",
    },
  );
  if (!targetPick) {
    return undefined;
  }

  if (targetPick.value === "shared") {
    return {
      kind: "shared",
      codeKind: codeKind,
    };
  }

  // Allow all variations, including "Original", to be selected.
  const variations = experiment.variations ?? [];
  if (variations.length === 0) {
    vscode.window.showWarningMessage("This experiment has no variations.");
    return undefined;
  }

  let variation: OptimizelyVariation | undefined;

  if (variationIdFromFile) {
    variation = variations.find((v) => v.variation_id === variationIdFromFile);
    if (!variation) {
      vscode.window.showWarningMessage(
        `Variation ID ${variationIdFromFile} from file is not valid for experiment "${experiment.name}". Please select a variation.`,
      );
    }
  }

  if (!variation) {
    const variationPick = await vscode.window.showQuickPick<
      vscode.QuickPickItem & { variation: OptimizelyVariation }
    >(
      variations.map((v) => ({
        label: v.name || v.key || `Variation ${v.variation_id}`,
        description: String(v.variation_id),
        detail: v.key ? `(key: ${v.key})` : undefined,
        variation: v,
      })),
      {
        title: "Select Optimizely Variation",
        placeHolder: "Variation to update",
        matchOnDescription: true,
        matchOnDetail: true,
      },
    );
    if (!variationPick) return undefined;
    variation = variationPick.variation;
  }

  return {
    kind: "variation",
    codeKind: codeKind,
    variation,
  };
}

async function confirmPush(
  project: OptimizelyProject,
  experiment: OptimizelyExperiment,
  target: PushTarget,
  document: vscode.TextDocument,
): Promise<boolean> {
  const answer = await vscode.window.showWarningMessage(
    [
      "Push this file to Optimizely?",
      `Project: ${project.name} (${project.id})`,
      `Experiment: ${experiment.name} (${experiment.id})`,
      `Target: ${describeTarget(target)}`,
      `File: ${document.fileName}`,
    ].join("\n"),
    { modal: true },
    "Push",
  );

  return answer === "Push";
}

function buildExperimentPatch(
  experiment: OptimizelyExperiment,
  target: PushTarget,
  code: string,
  pageId: number | undefined,
): Partial<OptimizelyExperiment> {
  if (target.kind === "shared") {
    return buildSharedExperimentPatch(experiment, target.codeKind, code);
  }

  return buildVariationExperimentPatch(experiment, target, code, pageId);
}

function buildSharedExperimentPatch(
  experiment: OptimizelyExperiment,
  codeKind: CodeKind,
  code: string,
): Partial<OptimizelyExperiment> {
  return sanitizeExperimentForPatch({
    ...experiment,
    changes: upsertCodeChange(experiment.changes ?? [], codeKind, code),
  });
}

function buildVariationExperimentPatch(
  experiment: OptimizelyExperiment,
  target: PushTarget,
  code: string,
  pageId: number | undefined,
): Partial<OptimizelyExperiment> {
  if (!target.variation?.variation_id) {
    throw new Error("Variation target was selected without a variation.");
  }
  if (pageId === undefined) {
    throw new Error("Variation code pushes require a selected page_id.");
  }

  const updatedVariations = (experiment.variations ?? []).map(
    (currentVariation) => {
      const isTargetVariation =
        currentVariation.variation_id === target.variation?.variation_id;
      if (!isTargetVariation) {
        return currentVariation;
      }

      return {
        ...currentVariation,
        actions: upsertVariationAction(
          currentVariation.actions ?? [],
          pageId,
          target.codeKind,
          code,
        ),
      };
    },
  );

  return { variations: updatedVariations };
}

function upsertVariationAction(
  actions: OptimizelyAction[],
  pageId: number,
  codeKind: CodeKind,
  code: string,
): OptimizelyAction[] {
  const updatedActions = actions.slice();
  const actionIndex = updatedActions.findIndex((action) =>
    isActionForPage(action, pageId),
  );

  if (actionIndex === -1) {
    return [
      ...updatedActions,
      {
        page_id: pageId,
        changes: upsertCodeChange([], codeKind, code),
      },
    ];
  }

  const action = { ...updatedActions[actionIndex], page_id: pageId };
  action.changes = upsertCodeChange(action.changes ?? [], codeKind, code);
  updatedActions[actionIndex] = action;
  return updatedActions;
}

function sanitizeExperimentForPatch(
  experiment: OptimizelyExperiment,
): Partial<OptimizelyExperiment> {
  return {
    ...experiment,
    changes: Array.isArray(experiment.changes)
      ? experiment.changes.map(sanitizeCodeChangeForPatch)
      : experiment.changes,
    variations: Array.isArray(experiment.variations)
      ? experiment.variations.map(sanitizeVariationForPatch)
      : experiment.variations,
  };
}

function sanitizeVariationForPatch(
  variation: OptimizelyVariation,
): OptimizelyVariation {
  return {
    ...variation,
    changes: Array.isArray(variation.changes)
      ? variation.changes.map(sanitizeCodeChangeForPatch)
      : variation.changes,
    actions: Array.isArray(variation.actions)
      ? variation.actions.map(sanitizeActionForPatch)
      : variation.actions,
  };
}

function sanitizeActionForPatch(action: OptimizelyAction): OptimizelyAction {
  return {
    ...action,
    changes: Array.isArray(action.changes)
      ? action.changes.map(sanitizeCodeChangeForPatch)
      : action.changes,
  };
}

function isActionForPage(action: OptimizelyAction, pageId: number): boolean {
  return Number(action.page_id) === pageId;
}

function upsertCodeChange(
  changes: OptimizelyChange[],
  codeKind: CodeKind,
  code: string,
): OptimizelyChange[] {
  const index = changes.findIndex((change) => isCodeChange(change, codeKind));

  if (index === -1) {
    return [
      ...changes.map(sanitizeCodeChangeForPatch),
      createCodeChange(codeKind, code),
    ];
  }

  // This is an update. Rebuild the array to be safe for a PATCH request.
  return changes.map((change, currentIndex) => {
    const payloadChange = sanitizeCodeChangeForPatch(change);

    if (currentIndex === index) {
      // This is the change we are updating.
      payloadChange.value = code;
    }

    return payloadChange;
  });
}

function createCodeChange(codeKind: CodeKind, code: string): OptimizelyChange {
  if (codeKind === "javascript") {
    return {
      async: false,
      dependencies: [],
      type: "custom_code",
      value: code,
    };
  }

  return {
    dependencies: [],
    selector: "head",
    type: "custom_css",
    value: code,
  };
}

function sanitizeCodeChangeForPatch(
  change: OptimizelyChange,
): OptimizelyChange {
  const payloadChange = { ...change };
  // The 'id' property is read-only and should not be included in a PATCH request.
  delete payloadChange.id;
  return payloadChange;
}

function isCodeChange(change: OptimizelyChange, codeKind: CodeKind): boolean {
  const type = String(change.type ?? "").toLowerCase();
  if (codeKind === "javascript") {
    return (
      type.includes("custom_code") ||
      type.includes("javascript") ||
      type === "js"
    );
  }

  return type.includes("custom_css") || type.includes("css");
}

function describeTarget(target: PushTarget): string {
  if (target.kind === "shared") {
    return `experiment shared ${target.codeKind.toUpperCase()}`;
  }

  const variationName =
    target.variation?.name ||
    target.variation?.key ||
    target.variation?.variation_id;
  return `variation "${variationName}" ${target.codeKind.toUpperCase()}`;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

class OptimizelyClient {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getExperiment(
    token: string,
    experimentId: number,
  ): Promise<OptimizelyExperiment> {
    return this.request<OptimizelyExperiment>(
      token,
      "GET",
      `/v2/experiments/${experimentId}`,
    );
  }

  async getPage(token: string, pageId: number): Promise<OptimizelyPage> {
    return this.request<OptimizelyPage>(token, "GET", `/v2/pages/${pageId}`);
  }

  async updateExperiment(
    token: string,
    experimentId: number,
    payload: Partial<OptimizelyExperiment>,
  ): Promise<OptimizelyExperiment> {
    const config = vscode.workspace.getConfiguration("optimizelyTools");
    const publishOnPush = config.get<boolean>("publishOnPush", false);
    const overrideDrafts = config.get<boolean>("overrideDrafts", false);
    const params = new URLSearchParams();

    if (publishOnPush) {
      params.set("action", "publish");
    }
    if (overrideDrafts) {
      params.set("override_changes", "true");
    }

    const suffix = params.toString() ? `?${params.toString()}` : "";
    return this.request<OptimizelyExperiment>(
      token,
      "PATCH",
      `/v2/experiments/${experimentId}${suffix}`,
      payload,
    );
  }

  private request<T>(
    token: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const baseUrl = vscode.workspace
      .getConfiguration("optimizelyTools")
      .get<string>("apiBaseUrl", "https://api.optimizely.com");
    const url = new URL(path, normalizeBaseUrl(baseUrl));
    const bodyText = body === undefined ? undefined : JSON.stringify(body);
    const transport = url.protocol === "http:" ? http : https;

    return new Promise<T>((resolve, reject) => {
      const request = transport.request(
        url,
        {
          method,
          headers: {
            accept: "application/json",
            authorization: `Bearer ${token}`,
            ...(bodyText
              ? {
                  "content-type": "application/json",
                  "content-length": Buffer.byteLength(bodyText),
                }
              : {}),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) =>
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
          );
          response.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            const statusCode = response.statusCode ?? 0;

            if (statusCode < 200 || statusCode >= 300) {
              reject(new Error(buildApiError(method, url, statusCode, text)));
              return;
            }

            if (!text) {
              resolve(undefined as T);
              return;
            }

            try {
              resolve(JSON.parse(text) as T);
            } catch {
              reject(
                new Error(
                  `Optimizely returned non-JSON response from ${url.pathname}.`,
                ),
              );
            }
          });
        },
      );

      request.on("error", reject);
      request.setTimeout(30000, () => {
        request.destroy(new Error("Optimizely API request timed out."));
      });

      if (bodyText) {
        request.write(bodyText);
      }

      request.end();
    });
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function buildApiError(
  method: string,
  url: URL,
  statusCode: number,
  text: string,
): string {
  const details = tryParseJsonMessage(text);
  return `Optimizely API ${method} ${url.pathname} failed with ${statusCode}${details ? `: ${details}` : "."}`;
}

function tryParseJsonMessage(text: string): string | undefined {
  if (!text) {
    return undefined;
  }

  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    const message = value.message ?? value.error ?? value.detail ?? value.title;
    if (typeof message === "string") {
      return message;
    }
    // If we parsed JSON but didn't find a standard message property, return the whole thing.
    return JSON.stringify(value);
  } catch {
    // Use a short raw fallback below.
  }

  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}
