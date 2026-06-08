// Minimal type declarations for the subset of eslint-scope we use. The package
// ships no types, and we only need scope analysis to read unresolved references.
declare module "eslint-scope" {
  interface ScopeReference {
    identifier: { name: string };
  }
  interface Scope {
    through: ScopeReference[];
  }
  interface ScopeManager {
    globalScope: Scope;
  }
  interface AnalyzeOptions {
    ecmaVersion?: number;
    sourceType?: "script" | "module";
    optimistic?: boolean;
    ignoreEval?: boolean;
    nodejsScope?: boolean;
  }
  export function analyze(ast: unknown, options?: AnalyzeOptions): ScopeManager;
}
