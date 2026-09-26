/**
 * Unpark the webview iframe for explorer (string-MIME) drags.
 *
 * Workbench `Une` (WebviewWindowDragMonitor):
 *   window `drag` → shiftKey ? windowDidDragEnd() : windowDidDragStart()
 *   park = outer webview iframe `style.pointerEvents = "none"`
 *
 * Pre-script (`pre/index.html`) posts `drag` `{ shiftKey }` only when every
 * `dataTransfer` item is `kind === "file"` (Finder). Explorer items are strings
 * (`ResourceURLs`, `CodeFiles`, `text/uri-list`, …), so the pre-script never
 * posts and the iframe stays parked before the pointer enters — enter/over/drop
 * never arrive until a workbench mousemove briefly unparks.
 *
 * While parked, timers still run. The park itself is the drag-in-progress signal:
 * when the outer iframe's `pointerEvents` is `"none"`, post the same host message
 * the pre-script uses (`{ channel: "drag", data: { shiftKey: true } }`) so the
 * monitor unparks. Idle / Finder-with-shift (not parked) → no posts.
 *
 * The MessagePort is captured with a one-shot wrap that is restored in the same
 * turn — the prototype is never left replaced, and we only call the original
 * `postMessage` on the captured port instance.
 */

type PortPost = (this: MessagePort, message: unknown, ...rest: unknown[]) => void;

let outerWebview: HTMLElement | null = null;
let hostPort: MessagePort | null = null;
let portPost: PortPost | null = null;

function restoreParentShadow(): void {
  const w = window as Window & { parent: Window; frameElement: Element | null };
  try {
    w.parent = w;
    w.frameElement = null;
  } catch {
    // ignore
  }
}

/** Briefly unshadow `window.parent` (vscode api sets it to `window`). */
function withRealParent<T>(fn: (parent: Window) => T): T | undefined {
  const w = window as Window & { parent: Window; frameElement: Element | null };
  try {
    // Own-property shadows from the vscode api script — delete restores the real frame.
    delete (w as unknown as { parent?: Window }).parent;
    delete (w as unknown as { frameElement?: Element | null }).frameElement;
    return fn(w.parent);
  } catch {
    return undefined;
  } finally {
    restoreParentShadow();
  }
}

function cacheOuterWebview(): void {
  withRealParent((parent) => {
    const el = parent.frameElement;
    if (el instanceof HTMLElement) outerWebview = el;
  });
}

/**
 * One-shot: wrap parent `MessagePort.prototype.postMessage` only for the
 * synchronous `postExtension` that follows, capture the host port, restore.
 */
function captureHostPort(): boolean {
  if (hostPort && portPost) return true;
  const ok =
    withRealParent((parent) => {
      const Port = (parent as unknown as typeof globalThis).MessagePort;
      const proto = Port.prototype;
      const orig = proto.postMessage as PortPost;
      let captured: MessagePort | null = null;
      proto.postMessage = function (this: MessagePort, message: unknown, ...rest: unknown[]) {
        if (message && typeof message === "object" && message !== null && "channel" in message) {
          captured = this;
        }
        return orig.apply(this, [message, ...rest] as never);
      };
      try {
        // Goes through acquireVsCodeApi → hostMessaging → port1.postMessage.
        (
          globalThis as { __opensiderPost?: (message: unknown) => void }
        ).__opensiderPost?.({ type: "opensider.portCapture" });
      } finally {
        proto.postMessage = orig as typeof proto.postMessage;
      }
      if (!captured) return false;
      hostPort = captured;
      portPost = orig;
      return true;
    }) ?? false;
  return ok;
}

function isOuterParked(): boolean {
  if (!outerWebview) cacheOuterWebview();
  return outerWebview?.style.pointerEvents === "none";
}

/** Same payload the pre-script sends for Finder with shift held. */
function postUnpark(): void {
  if (!captureHostPort() || !hostPort || !portPost) return;
  try {
    portPost.call(hostPort, { channel: "drag", data: { shiftKey: true } });
  } catch {
    hostPort = null;
    portPost = null;
  }
}

/**
 * While the view is visible, if the monitor has parked us, reclaim the frame.
 * Does not post when we are not parked (idle / Finder already live).
 */
export function startParkedUnparkWatch(): () => void {
  cacheOuterWebview();
  captureHostPort();
  const id = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    if (!isOuterParked()) return;
    postUnpark();
  }, 50);
  return () => window.clearInterval(id);
}
