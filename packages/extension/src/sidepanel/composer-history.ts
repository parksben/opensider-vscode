import { useEffect, useState } from "react";
import type { EditorTab } from "@shared";
import { currentEditorTabs, TABS_EVENT } from "./bridge";

/**
 * The files open in the editor right now, for the `@` menu.
 *
 * The editor tab strip is the "what am I looking at" list the `@` menu offers. The
 * extension host pushes it on every tab change (see `openEditorTabs`).
 */
export type HistoryTab = EditorTab;

export function useComposerHistory(): { tabs: HistoryTab[] } {
  const [tabs, setTabs] = useState<HistoryTab[]>(() => currentEditorTabs());

  useEffect(() => {
    const onTabs = (event: Event) => {
      setTabs(((event as CustomEvent).detail as EditorTab[]) ?? []);
    };
    window.addEventListener(TABS_EVENT, onTabs);
    return () => window.removeEventListener(TABS_EVENT, onTabs);
  }, []);

  return { tabs };
}
