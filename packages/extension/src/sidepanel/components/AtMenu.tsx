import type { AttachmentItem } from "@shared";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  atMenuLock,
  armEnterSuppress,
  blockEnterEvent,
  closeAtMenuLock,
  isEnterKey,
  openAtMenuLock,
  releaseEnterSuppress,
} from "../at-menu-lock";
import { filterAtAttachments, filterAtTabs, matchFieldPriority } from "../at-menu-search";
import { attachmentToMention, type MentionChip } from "../mentions";
import type { Locale, MessageKey } from "../i18n";
import { t } from "../i18n";
import type { HistoryTab } from "../composer-history";
import { HighlightText } from "./HighlightText";
import { RippleButton } from "./RippleButton";
import { MentionIcon } from "./MentionChip";

const SAFE = 16;
const GAP = 6;
const MENU_WIDTH = 256;

/**
 * 标签页和附件混在一个列表里，来源靠标题后面那个弱化的类型标记区分：图标已经表示文件 /
 * 文件夹 / 图片，标记表示这一项是从编辑器标签页来的还是输入框里已有的附件。
 */
type AtRow = {
  key: string;
  mention: MentionChip;
  title: string;
  label: string;
  labelRanges: ReadonlyArray<readonly [number, number]>;
  tagKey: MessageKey;
  priority: number;
};

function placeMenu(
  anchor: DOMRect,
  menuHeight: number,
  vw: number,
  vh: number,
): { top: number; left: number; maxHeight: number } {
  const maxWidth = Math.max(80, vw - SAFE * 2);
  const width = Math.min(MENU_WIDTH, maxWidth);
  const spaceAbove = Math.max(0, anchor.top - SAFE - GAP);
  const maxHeight = spaceAbove > 0 ? Math.min(spaceAbove, vh - SAFE * 2) : Math.max(72, vh - SAFE * 2);
  const height = Math.min(menuHeight, maxHeight);
  let top = spaceAbove > 0 ? anchor.top - GAP - height : SAFE;
  if (top < SAFE) top = SAFE;
  if (top + height > vh - SAFE) top = Math.max(SAFE, vh - SAFE - height);
  let left = anchor.left;
  if (left + width > vw - SAFE) left = vw - SAFE - width;
  if (left < SAFE) left = SAFE;
  return { top, left, maxHeight };
}

export function AtMenu({
  open,
  locale,
  query,
  tabs,
  attachments,
  ignoreRef,
  getAnchorRect,
  onSelect,
  onClose,
}: {
  open: boolean;
  locale: Locale;
  query: string;
  tabs: HistoryTab[];
  attachments: AttachmentItem[];
  ignoreRef?: RefObject<HTMLElement | null>;
  getAnchorRect?: () => DOMRect | undefined;
  onSelect: (mention: MentionChip) => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState({ top: 0, left: 0, maxHeight: 224, ready: false });

  const searching = query.trim().length > 0;
  const rows = useMemo<AtRow[]>(() => {
    const tabRows = filterAtTabs(tabs, query).map<AtRow>((match) => ({
      key: `tab:${match.tab.path}`,
      mention: {
        kind: "tab",
        path: match.tab.path,
        relativePath: match.tab.relativePath,
        name: match.tab.name,
      },
      title: match.tab.path,
      label: match.label,
      labelRanges: match.labelRanges,
      tagKey: "atTagTab",
      priority: matchFieldPriority(match.matchField),
    }));
    const attachmentRows = filterAtAttachments(attachments, query).map<AtRow>((match) => ({
      key: `att:${match.item.path}`,
      mention: attachmentToMention(match.item),
      title: match.item.path,
      label: match.label,
      labelRanges: match.labelRanges,
      tagKey: "atTagAttachment",
      priority: matchFieldPriority(match.matchField),
    }));
    const merged = [...tabRows, ...attachmentRows];
    // 有查询时按命中字段排相关性（文件名命中在路径命中之前），没查询时标签页排在附件之前。
    return searching ? merged.sort((a, b) => a.priority - b.priority) : merged;
  }, [attachments, query, searching, tabs]);
  const count = rows.length;
  const getAnchorRectRef = useRef(getAnchorRect);
  const highlightRef = useRef(highlight);
  const rowsRef = useRef(rows);
  const onSelectRef = useRef(onSelect);
  const onCloseRef = useRef(onClose);
  getAnchorRectRef.current = getAnchorRect;
  highlightRef.current = highlight;
  rowsRef.current = rows;
  onSelectRef.current = onSelect;
  onCloseRef.current = onClose;

  const pendingCloseRef = useRef(false);

  const pick = (mention: MentionChip, fromKeyboard = false) => {
    if (fromKeyboard) {
      pendingCloseRef.current = true;
      armEnterSuppress();
    } else {
      pendingCloseRef.current = false;
      releaseEnterSuppress();
      closeAtMenuLock();
      onCloseRef.current();
    }
    onSelectRef.current(mention);
  };

  const confirmHighlight = (event?: Event) => {
    if (pendingCloseRef.current) return;
    if (event && atMenuLock.lastEnter === event) return;
    if (event) atMenuLock.lastEnter = event;
    const chosen = rowsRef.current[highlightRef.current];
    if (!chosen) return;
    pick(chosen.mention, true);
  };

  if (open) atMenuLock.confirm = confirmHighlight;

  useEffect(() => {
    if (!open) return;
    setHighlight(0);
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useLayoutEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-at-index="${highlight}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [open, highlight, query]);

  useLayoutEffect(() => {
    if (!open) {
      setPos((current) => (current.ready ? { ...current, ready: false } : current));
      return;
    }
    const update = () => {
      const menu = rootRef.current;
      const anchor = getAnchorRectRef.current?.();
      if (!menu) return;
      const fallback = new DOMRect(SAFE, window.innerHeight - 120, 0, 0);
      const next = placeMenu(
        anchor && (anchor.top || anchor.left) ? anchor : fallback,
        menu.scrollHeight,
        window.innerWidth,
        window.innerHeight,
      );
      setPos({ ...next, ready: true });
    };
    update();
    const frame = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, query, tabs, attachments]);

  useLayoutEffect(() => {
    if (!open) return;
    openAtMenuLock();
    pendingCloseRef.current = false;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || ignoreRef?.current?.contains(target)) return;
      pendingCloseRef.current = false;
      releaseEnterSuppress();
      closeAtMenuLock();
      onCloseRef.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        pendingCloseRef.current = false;
        releaseEnterSuppress();
        closeAtMenuLock();
        onCloseRef.current();
        return;
      }
      // 菜单开着的时候 Tab 不能把焦点从输入框带走，否则菜单会留在屏幕上没人管。
      if (event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        const total = rowsRef.current.length;
        if (total === 0) return;
        setHighlight((index) => (index + 1) % total);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        const total = rowsRef.current.length;
        if (total === 0) return;
        setHighlight((index) => (index - 1 + total) % total);
        return;
      }
      if (isEnterKey(event)) {
        blockEnterEvent(event);
        confirmHighlight(event);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!isEnterKey(event) || !pendingCloseRef.current) return;
      pendingCloseRef.current = false;
      releaseEnterSuppress();
      closeAtMenuLock();
      onCloseRef.current();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keyup", onKeyUp, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("keyup", onKeyUp, true);
      if (!pendingCloseRef.current) {
        atMenuLock.confirm = null;
        if (!atMenuLock.suppressSubmit) closeAtMenuLock();
      }
    };
  }, [open]);

  if (!open) return null;

  const emptyKey: MessageKey | null = count === 0 ? (searching ? "atNoMatches" : "atNoItems") : null;

  return createPortal(
    <div
      ref={rootRef}
      className="fixed z-[80] flex w-64 flex-col overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-xl"
      style={{
        top: pos.top,
        left: pos.left,
        maxHeight: pos.maxHeight,
        opacity: pos.ready ? 1 : 0,
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
        {emptyKey ? (
          <p className="px-2.5 py-1.5 text-[12px] text-[var(--muted)]">{t(locale, emptyKey)}</p>
        ) : (
          rows.map((row, index) => {
            const active = index === highlight;
            return (
              <RippleButton
                key={row.key}
                data-at-index={index}
                title={row.title}
                onMouseDown={(event) => event.preventDefault()}
                onPointerEnter={() => setHighlight(index)}
                onClick={() => pick(row.mention)}
                className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[12px] ${
                  active ? "bg-[var(--hover-strong)] text-[var(--text)]" : "text-[var(--muted)]"
                }`}
              >
                <MentionIcon mention={row.mention} />
                <HighlightText text={row.label} ranges={row.labelRanges} className="min-w-0 flex-1 truncate" />
                <span className="shrink-0 text-[10px] text-[var(--muted)]">{t(locale, row.tagKey)}</span>
              </RippleButton>
            );
          })
        )}
      </div>
    </div>,
    document.body,
  );
}
