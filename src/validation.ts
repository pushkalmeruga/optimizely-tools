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

export interface UndefinedReference {
  // Identifier referenced but never declared, imported, or recognized as a
  // runtime global — i.e. a likely typo or missing import.
  name: string;
  // Character offsets into the analyzed source, suitable for mapping to editor
  // positions via TextDocument.positionAt.
  start: number;
  end: number;
}

// Statically analyzes JavaScript source and returns every reference that escapes
// to the global scope without resolving to a declaration, an import, or a known
// global. Each usage is returned separately (with its source range) so every
// occurrence can be marked in the editor. Analysis is best-effort: if the code
// cannot be parsed or analyzed, an empty list is returned rather than throwing,
// so validation never blocks a push or breaks editing.
export function findUndefinedReferences(
  code: string,
  extraGlobals: readonly string[] = [],
): UndefinedReference[] {
  const references = analyzeFreeReferences(code);
  if (!references) {
    return [];
  }

  const allowed = new Set<string>([...KNOWN_GLOBALS, ...extraGlobals]);
  return references.filter((reference) => !allowed.has(reference.name));
}

// Source files generally use ES module syntax (imports), but a hand-written
// snippet may be a plain script; try module first and fall back to script so
// either parses.
function analyzeFreeReferences(
  code: string,
): UndefinedReference[] | undefined {
  for (const sourceType of ["module", "script"] as const) {
    let ast: acorn.Node;
    try {
      ast = acorn.parse(code, {
        ecmaVersion: "latest",
        sourceType,
        ranges: true,
      });
    } catch {
      // Try the other source type before giving up.
      continue;
    }

    try {
      const scopeManager = analyze(ast, { ecmaVersion: 2022, sourceType });
      return scopeManager.globalScope.through.map((reference) => ({
        name: reference.identifier.name,
        start: reference.identifier.start,
        end: reference.identifier.end,
      }));
    } catch {
      // Parsed but could not be analyzed: do not block on an edge case.
      return undefined;
    }
  }

  return undefined;
}
