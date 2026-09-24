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

declare module "*.svg?url" {
  const url: string;
  export default url;
}
