import { postExtension } from "./bridge";

/** Ask the extension host whether the OpenSider browser extension is installed. */
export function requestBrowserProbe(): Promise<boolean | null> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(null);
    }, 4000);
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; requestId?: string; installed?: boolean } | undefined;
      if (!data || data.type !== "peer.probed" || data.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(typeof data.installed === "boolean" ? data.installed : null);
    };
    window.addEventListener("message", onMessage);
    postExtension({ type: "peer.probe", requestId, target: "browser" });
  });
}
