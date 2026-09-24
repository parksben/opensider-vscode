import { postExtension } from "./bridge";

/**
 * Where a link in the conversation goes.
 *
 * The extension host decides: it tries to resolve the target as a file in the open
 * workspace and opens it in a tab, and only falls back to the system browser when it
 * cannot. Doing the check there keeps one definition of "is this a workspace file",
 * shared with tool cards and selection chips.
 */
export function openAgentLink(href: string): void {
  const target = href.trim();
  if (!target) return;
  postExtension({ type: "openExternal", url: target });
}
