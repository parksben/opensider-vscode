/** The handle VS Code injects into every webview. */
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

/**
 * The sidebar came from a Chrome extension and a few modules still call `chrome.*`.
 * `src/sidepanel/chrome-shim.ts` installs a minimal stand-in; this is its shape.
 */
declare const chrome: {
  runtime: {
    lastError?: { message?: string };
    getURL(path: string): string;
    sendMessage(message?: unknown): Promise<unknown>;
  };
  i18n: { getUILanguage(): string };
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    };
    session: {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    };
  };
};

/**
 * The workspace this window has open, baked into the document by `panelHtml` in
 * `src/extension.ts`. It is available synchronously so the first read of the shared
 * `localStorage` cache is already scoped to the right project. `key` is empty when no
 * folder is open.
 */
interface Window {
  __opensiderWorkspace?: { key: string; name: string };
  /** package.json version, baked in by panelHtml. */
  __opensiderExtensionVersion?: string;
}

declare module "*.svg?url" {
  const url: string;
  export default url;
}
