import * as vscode from "vscode";

/**
 * Scope that matches no real token. Its `fontFamily` is still emitted: the
 * workbench copies every textmate rule's fontFamily into `.vscode-tokens-styles`
 * and interpolates that string raw (`font-family: ${fontFamily}`).
 *
 * The same string is the `configurationDefaults` value in package.json.
 */
export const EXPLORER_DRAG_SCOPE = "opensider.webview.drag";

/**
 * Closes the token rule, then forces this extension's webview iframe to stay
 * hittable. The monitor sets `element.style.pointerEvents = "none"` (not
 * important); a stylesheet `!important` wins, so explorer dragover hit-tests
 * the iframe on first contact. Other webviews are not matched.
 */
export const EXPLORER_DRAG_FONT_FAMILY =
  'inherit;}iframe.webview[src*="extensionId=opensider.opensider-vscode"]{pointer-events:auto!important}.opensider-noop{font-family:inherit';

type TokenRule = { scope?: string | string[]; settings?: { fontFamily?: string } };
type TokenCustomizations = { textMateRules?: TokenRule[] } & Record<string, unknown>;

function hasDragRule(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const rules = (value as TokenCustomizations).textMateRules;
  if (!Array.isArray(rules)) return false;
  return rules.some(
    (rule) => rule?.scope === EXPLORER_DRAG_SCOPE && rule.settings?.fontFamily === EXPLORER_DRAG_FONT_FAMILY,
  );
}

function withDragRule(value: TokenCustomizations | undefined): TokenCustomizations {
  const base = value ?? {};
  const rules = Array.isArray(base.textMateRules)
    ? base.textMateRules.filter((rule) => rule?.scope !== EXPLORER_DRAG_SCOPE)
    : [];
  rules.push({ scope: EXPLORER_DRAG_SCOPE, settings: { fontFamily: EXPLORER_DRAG_FONT_FAMILY } });
  return { ...base, textMateRules: rules };
}

/**
 * Keep the iframe hittable while the monitor parks it.
 *
 * `configurationDefaults` covers an unset `editor.tokenColorCustomizations`.
 * A user or workspace value replaces that default entirely, so if the effective
 * value is missing the rule, merge it into the overriding target.
 */
export function ensureExplorerDragHitTesting(): void {
  const config = vscode.workspace.getConfiguration("editor");
  if (hasDragRule(config.get("tokenColorCustomizations"))) return;

  const inspected = config.inspect<TokenCustomizations>("tokenColorCustomizations");
  const folder = vscode.workspace.workspaceFolders?.[0];
  let target = vscode.ConfigurationTarget.Global;
  let base = inspected?.globalValue;
  let writer = config;
  if (inspected?.workspaceFolderValue && folder) {
    target = vscode.ConfigurationTarget.WorkspaceFolder;
    base = inspected.workspaceFolderValue;
    writer = vscode.workspace.getConfiguration("editor", folder);
  } else if (inspected?.workspaceValue) {
    target = vscode.ConfigurationTarget.Workspace;
    base = inspected.workspaceValue;
  }

  void writer.update("tokenColorCustomizations", withDragRule(base), target).then(undefined, () => {
    // Read-only settings: the configurationDefaults rule still applies when nothing overrides it.
  });
}
