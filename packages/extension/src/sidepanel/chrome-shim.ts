/**
 * 侧栏是从 Chrome 扩展搬过来的，少数模块仍按 `chrome.*` 写。这里提供一层最小垫片，
 * 让它们在 webview 里退化成无副作用的行为。
 *
 * 只保留两件真事：
 *  - `chrome.storage.local` 转到 webview 的 `localStorage`，作为会话的热缓存；
 *    权威副本在 `~/.opensider-vscode/ui-state.json`，由宿主持有。
 *  - `chrome.i18n.getUILanguage` 返回 VS Code 的界面语言。
 *
 * 其余（tabs / windows / runtime.connect）在 VS Code 里没有对应物，一律空实现。
 */

type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};

const PREFIX = "opensider-vscode/";

function localArea(): StorageArea {
  return {
    async get(key) {
      try {
        const raw = window.localStorage.getItem(PREFIX + key);
        return { [key]: raw ? JSON.parse(raw) : undefined };
      } catch {
        return { [key]: undefined };
      }
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) {
        try {
          window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
        } catch {
          // Quota or serialization failure: the host mirror is the authoritative copy.
        }
      }
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        try {
          window.localStorage.removeItem(PREFIX + key);
        } catch {
          // ignore
        }
      }
    },
  };
}

function memoryArea(): StorageArea {
  const store = new Map<string, unknown>();
  return {
    async get(key) {
      return { [key]: store.get(key) };
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) store.set(key, value);
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
    },
  };
}

const chromeShim = {
  runtime: {
    lastError: undefined as { message?: string } | undefined,
    getURL: (path: string) => path,
    sendMessage: async () => ({ ok: true }),
  },
  i18n: {
    // VS Code's display language, baked into the document by panelHtml. Falls back to the
    // document/browser language when the panel runs outside VS Code (the shots page).
    getUILanguage: () => window.__opensiderLanguage || document.documentElement.lang || navigator.language,
  },
  storage: {
    local: localArea(),
    session: memoryArea(),
  },
};

(globalThis as unknown as { chrome: typeof chromeShim }).chrome = chromeShim;
