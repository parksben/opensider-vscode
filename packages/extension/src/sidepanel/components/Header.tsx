import type { AgentProgress, HostStatusState } from "@shared";
import { CircleArrowUp, MessageSquare, RotateCw, Unplug } from "lucide-react";
import type { Locale } from "../i18n";
import { t } from "../i18n";
import { isPlaceholderTitle } from "../persist";
import { COMPOSER_ICON_PX } from "../layout";
import { IconButton } from "./IconButton";
import { RippleButton } from "./RippleButton";

/** VS Code's secondary-sidebar toggle: layout-sidebar-right / layout-sidebar-right-off. */
function SideBarToggleIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      {open ? (
        <path d="M12.5 1C13.881 1 15 2.119 15 3.5V12.5C15 13.881 13.881 15 12.5 15H3.5C2.119 15 1 13.881 1 12.5V3.5C1 2.119 2.119 1 3.5 1H12.5ZM9 14V2H3.5C2.672 2 2 2.672 2 3.5V12.5C2 13.328 2.672 14 3.5 14H9Z" />
      ) : (
        <path d="M12.5 1H3.5C2.122 1 1 2.122 1 3.5V12.5C1 13.879 2.122 15 3.5 15H12.5C13.878 15 15 13.879 15 12.5V3.5C15 2.122 13.878 1 12.5 1ZM2 12.5V3.5C2 2.673 2.673 2 3.5 2H9V14H3.5C2.673 14 2 13.327 2 12.5ZM14 12.5C14 13.327 13.327 14 12.5 14H10V2H12.5C13.327 2 14 2.673 14 3.5V12.5Z" />
      )}
    </svg>
  );
}

export function Header({
  locale,
  status,
  error,
  progress,
  sessionTitle,
  sessionsOpen,
  updateAvailable,
  onRetry,
  onToggleSessions,
  onShowUpdate,
}: {
  locale: Locale;
  status: HostStatusState;
  error?: string;
  progress?: AgentProgress;
  sessionTitle: string;
  sessionsOpen: boolean;
  updateAvailable?: boolean;
  onRetry?: () => void;
  onToggleSessions: () => void;
  onShowUpdate?: () => void;
}) {
  const label = (key: Parameters<typeof t>[1]) => t(locale, key);
  const unnamed = isPlaceholderTitle(sessionTitle);
  const title = unnamed ? label("untitled") : sessionTitle.trim();
  // Agent 切换钮已经搬到输入框里（见 ChatPane）；连接中的完整进度也搬到了输入框底部，
  // 顶栏这里只保留 `2/6` 这种最小提示。状态放在右侧：标题左缘固定在图标处，连接 / 重连
  // 都不会把它推来推去。
  const showStatus = status !== "ready";

  const statusChip = showStatus ? (
    <div className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px]" title={error}>
      <Unplug
        size={13}
        className={status === "error" || status === "missing" ? "text-[var(--bad)]" : "text-[var(--warn)]"}
      />
      <span className="text-[var(--muted)]">
        {status === "starting"
          ? label("starting")
          : status === "connecting"
            ? progress
              ? `${progress.index}/${progress.total}`
              : label("connecting")
            : label("offline")}
      </span>
    </div>
  ) : null;

  const retryButton =
    (status === "error" || status === "missing") && onRetry ? (
      <RippleButton
        onClick={onRetry}
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--text)]"
      >
        <RotateCw size={12} />
        {label("retry")}
      </RippleButton>
    ) : null;

  const drawerButton = (
    <IconButton
      label={sessionsOpen ? label("collapseSessions") : label("expandSessions")}
      onClick={onToggleSessions}
      aria-expanded={sessionsOpen}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--line)] text-[var(--text)]"
    >
      {sessionsOpen ? <SideBarToggleIcon open /> : <SideBarToggleIcon open={false} />}
    </IconButton>
  );

  const updateButton = updateAvailable ? (
    <IconButton
      label={label("updateDialogTitle")}
      onClick={onShowUpdate}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--line)] text-[var(--brass)]"
    >
      <CircleArrowUp size={14} />
      <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--brass)]" />
    </IconButton>
  ) : null;


  return (
    <header className="relative z-40 border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--panel)_88%,transparent)] px-3 py-2.5 backdrop-blur">
      {/* 一行到底：`min-w-0` 在标题上，面板再窄也只是省略标题，右侧按钮永远完整；标题
          不可点击改名（重命名只在右侧会话卡片上）。 */}
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <MessageSquare
            size={COMPOSER_ICON_PX}
            aria-hidden
            className="shrink-0 text-[var(--muted)] opacity-80"
          />
          <div
            title={title}
            className="min-w-0 flex-1 truncate whitespace-nowrap text-left text-[14px] font-medium tracking-tight text-[var(--text)]"
          >
            {title}
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          {statusChip}
          {retryButton}
          {updateButton}
          {drawerButton}
        </div>
      </div>

      {error && status === "error" ? (
        <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--bad)]">{error}</p>
      ) : null}
    </header>
  );
}
