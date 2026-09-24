import type { AttachmentItem } from "@shared";
import type { HistoryTab } from "./composer-history";

function uniqueByPath(list: AttachmentItem[]): AttachmentItem[] {
  const seen = new Set<string>();
  const out: AttachmentItem[] = [];
  for (const item of list) {
    if (!item.path || seen.has(item.path)) continue;
    seen.add(item.path);
    out.push(item);
  }
  return out;
}

export type AtMatchField = "name" | "path";

export type AtTabMatch = {
  tab: HistoryTab;
  matchField: AtMatchField;
  label: string;
  labelRanges: ReadonlyArray<readonly [number, number]>;
};

export type AtAttachmentMatch = {
  item: AttachmentItem;
  matchField: AtMatchField;
  label: string;
  labelRanges: ReadonlyArray<readonly [number, number]>;
};

export function findMatchRanges(text: string, query: string): ReadonlyArray<readonly [number, number]> {
  if (!query) return [];
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  const ranges: Array<[number, number]> = [];
  let start = 0;
  while (start <= lower.length - needle.length) {
    const index = lower.indexOf(needle, start);
    if (index < 0) break;
    ranges.push([index, index + needle.length]);
    start = index + needle.length;
  }
  return ranges;
}

function tabLabel(tab: HistoryTab): string {
  return tab.name || tab.relativePath;
}

function attachmentLabel(item: AttachmentItem): string {
  return item.name || item.path;
}

function matchFieldPriority(field: AtMatchField): number {
  return field === "name" ? 0 : 1;
}

function matchTab(tab: HistoryTab, query: string): AtTabMatch | null {
  const normalized = query.trim();
  if (!normalized) {
    return { tab, matchField: "name", label: tabLabel(tab), labelRanges: [] };
  }
  const name = tab.name || "";
  const relativePath = tab.relativePath || "";
  if (name.toLowerCase().includes(normalized.toLowerCase())) {
    return {
      tab,
      matchField: "name",
      label: tabLabel(tab),
      labelRanges: findMatchRanges(name, normalized),
    };
  }
  if (relativePath.toLowerCase().includes(normalized.toLowerCase())) {
    return {
      tab,
      matchField: "path",
      label: tabLabel(tab),
      labelRanges: findMatchRanges(name, normalized),
    };
  }
  return null;
}

function matchAttachment(item: AttachmentItem, query: string): AtAttachmentMatch | null {
  const normalized = query.trim();
  if (!normalized) {
    return { item, matchField: "name", label: attachmentLabel(item), labelRanges: [] };
  }
  const name = item.name || "";
  const path = item.path || "";
  if (name.toLowerCase().includes(normalized.toLowerCase())) {
    return {
      item,
      matchField: "name",
      label: attachmentLabel(item),
      labelRanges: findMatchRanges(name, normalized),
    };
  }
  if (path.toLowerCase().includes(normalized.toLowerCase())) {
    return {
      item,
      matchField: "path",
      label: attachmentLabel(item),
      labelRanges: findMatchRanges(name, normalized),
    };
  }
  return null;
}

export function filterAtTabs(tabs: HistoryTab[], query: string): AtTabMatch[] {
  const matches = tabs.map((tab) => matchTab(tab, query)).filter((item): item is AtTabMatch => item != null);
  if (!query.trim()) return matches;
  return matches.sort((a, b) => matchFieldPriority(a.matchField) - matchFieldPriority(b.matchField));
}

export function filterAtAttachments(attachments: AttachmentItem[], query: string): AtAttachmentMatch[] {
  const matches = uniqueByPath(attachments)
    .map((item) => matchAttachment(item, query))
    .filter((entry): entry is AtAttachmentMatch => entry != null);
  if (!query.trim()) return matches;
  return matches.sort((a, b) => matchFieldPriority(a.matchField) - matchFieldPriority(b.matchField));
}
