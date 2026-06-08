import * as acorn from "acorn";
import { analyze } from "eslint-scope";

// Identifiers that are legitimately available at runtime in a browser /
// Optimizely page context. A free reference to anything outside this set is
// almost always a typo or a missing import (e.g. `getUUID`, `safeFn`), so it is
// reported as a "possibly undefined" reference before a push. The list is
// intentionally generous: a false negative (failing to flag a real bug) is less
// disruptive than a false positive that nags on every push, and users can extend
// it via the `optimizelyTools.knownGlobals` setting.
const KNOWN_GLOBALS: ReadonlySet<string> = new Set([
  // Language built-ins
  "globalThis",
  "undefined",
  "NaN",
  "Infinity",
  "eval",
  "isNaN",
  "isFinite",
  "parseInt",
  "parseFloat",
  "encodeURI",
  "encodeURIComponent",
  "decodeURI",
  "decodeURIComponent",
  "escape",
  "unescape",
  "Object",
  "Function",
  "Boolean",
  "Symbol",
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
  "AggregateError",
  "Number",
  "BigInt",
  "Math",
  "Date",
  "String",
  "RegExp",
  "Array",
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "WeakRef",
  "FinalizationRegistry",
  "ArrayBuffer",
  "SharedArrayBuffer",
  "DataView",
  "JSON",
  "Promise",
  "Proxy",
  "Reflect",
  "Intl",
  "structuredClone",
  "queueMicrotask",
  // Browser / DOM globals
  "window",
  "self",
  "top",
  "parent",
  "frames",
  "document",
  "console",
  "navigator",
  "location",
  "history",
  "screen",
  "event",
  "name",
  "status",
  "origin",
  "localStorage",
  "sessionStorage",
  "performance",
  "crypto",
  "caches",
  "indexedDB",
  "devicePixelRatio",
  "innerWidth",
  "innerHeight",
  "outerWidth",
  "outerHeight",
  "scrollX",
  "scrollY",
  "pageXOffset",
  "pageYOffset",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
  "queueMicrotask",
  "fetch",
  "Headers",
  "Request",
  "Response",
  "XMLHttpRequest",
  "FormData",
  "WebSocket",
  "EventSource",
  "Worker",
  "URL",
  "URLSearchParams",
  "Blob",
  "File",
  "FileReader",
  "AbortController",
  "AbortSignal",
  "TextEncoder",
  "TextDecoder",
  "atob",
  "btoa",
  "alert",
  "confirm",
  "prompt",
  "open",
  "close",
  "focus",
  "blur",
  "scroll",
  "scrollTo",
  "scrollBy",
  "print",
  "postMessage",
  "matchMedia",
  "getComputedStyle",
  "getSelection",
  "addEventListener",
  "removeEventListener",
  "dispatchEvent",
  "MutationObserver",
  "IntersectionObserver",
  "IntersectionObserverEntry",
  "ResizeObserver",
  "PerformanceObserver",
  "Event",
  "CustomEvent",
  "EventTarget",
  "Node",
  "Element",
  "HTMLElement",
  "HTMLCollection",
  "NodeList",
  "NamedNodeMap",
  "Attr",
  "Text",
  "Comment",
  "DocumentFragment",
  "ShadowRoot",
  "DOMParser",
  "XMLSerializer",
  "Image",
  "Audio",
  "Option",
  "FontFace",
  "CSS",
  "customElements",
  "DOMRect",
  "DOMRectReadOnly",
  // Common analytics / experimentation globals on host pages
  "optimizely",
  "dataLayer",
  "google_tag_manager",
  "gtag",
  "ga",
  "gaplugins",
  "utag",
  "utag_data",
  "Tealium",
  "jQuery",
  "$",
]);

export interface JsValidationResult {
  // Identifiers referenced but never declared, imported, or recognized as a
  // runtime global — i.e. likely typos or missing imports.
  undefinedReferences: string[];
}

// Statically analyzes the bundled JavaScript that is about to be pushed and
// returns identifiers that are referenced but never resolved to a declaration,
// an import (already inlined by bundling), or a known global. Analysis runs on
// the bundled output so that resolvable imports are not falsely flagged.
export function validateBundledJavaScript(
  code: string,
  extraGlobals: readonly string[] = [],
): JsValidationResult {
  let ast: acorn.Node;
  try {
    ast = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "script",
      ranges: true,
    });
  } catch {
    // If the bundle does not parse, esbuild would already have failed the build
    // before this point; treat as "nothing to report" rather than blocking.
    return { undefinedReferences: [] };
  }

  let through: { identifier: { name: string } }[];
  try {
    const scopeManager = analyze(ast, {
      ecmaVersion: 2022,
      sourceType: "script",
    });
    through = scopeManager.globalScope.through;
  } catch {
    // Never let a scope-analysis edge case block a push.
    return { undefinedReferences: [] };
  }

  const allowed = new Set<string>([...KNOWN_GLOBALS, ...extraGlobals]);
  const undefinedReferences = [
    ...new Set(
      through
        .map((ref) => ref.identifier.name)
        .filter((referencedName) => !allowed.has(referencedName)),
    ),
  ].sort();

  return { undefinedReferences };
}
