import type { AgentInfo, AgentProgress } from "@shared";
import { Check, Copy, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { writeClipboard } from "../clipboard";
import type { Locale } from "../i18n";
import { t } from "../i18n";
import { RippleButton } from "./RippleButton";

/**
 * Shown when no ACP CLI could be found.
 *
 * The prompt points at the skill this extension copied into the user's home, not at a URL:
 * whatever agent they already have can read it offline and do the setup.
 */
function NoAgentSetup({ locale, onRetry }: { locale: Locale; onRetry: () => void }) {
  const [copied, setCopied] = useState(false);
  const prompt = t(locale, "setupPrompt");

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-5">
      <p className="text-[13px] font-medium text-[var(--text)]">{t(locale, "setupTitle")}</p>
      <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">{t(locale, "setupBody")}</p>
      <pre className="cs-setup-prompt overflow-x-auto whitespace-pre-wrap rounded-lg bg-[var(--code)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--text)]">
        {prompt}
      </pre>
      <div className="flex items-center gap-2">
        <RippleButton
          onClick={() => {
            void writeClipboard(prompt).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-[12px] text-[var(--text)]"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {t(locale, copied ? "setupCopied" : "setupCopy")}
        </RippleButton>
        <RippleButton
          onClick={onRetry}
          className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[12px] text-[var(--muted)]"
        >
          {t(locale, "setupRescan")}
        </RippleButton>
      </div>
    </div>
  );
}

const PHASE_KEYS = {
  resolve: "progressResolve",
  spawn: "progressSpawn",
  handshake: "progressHandshake",
  auth: "progressAuth",
  session: "progressSession",
  models: "progressModels",
} as const;

export function AgentSetup({
  locale,
  agents,
  selectedId,
  connecting,
  scanning,
  progress,
  error,
  onSelect,
  onCancel,
  onRetry,
}: {
  locale: Locale;
  agents: AgentInfo[];
  selectedId: string;
  connecting: boolean;
  scanning?: boolean;
  progress?: AgentProgress;
  error?: string;
  onSelect: (id: string) => void;
  onCancel?: () => void;
  onRetry: () => void;
}) {
  const selected = agents.find((item) => item.id === selectedId);
  const phaseKey = progress ? PHASE_KEYS[progress.phase as keyof typeof PHASE_KEYS] : undefined;
  const showEmpty = !connecting && !scanning && agents.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto px-5 py-8">
      <div className="flex w-full max-w-[22rem] flex-col items-center gap-5">
        <p className="text-center text-[13px] leading-relaxed text-[var(--muted)]">{t(locale, "setupHint")}</p>

        {connecting ? (
          <div className="flex w-full flex-col items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-5">
            <p className="text-[13px] text-[var(--text)]">
              {t(locale, "setupConnecting").replace("{name}", selected?.name ?? selectedId)}
            </p>
            {progress ? (
              <div className="flex w-full flex-col gap-2">
                <div className="h-1 overflow-hidden rounded-full bg-[var(--panel-2)]">
                  <div
                    className="h-full bg-[var(--brass)] transition-[width] duration-300"
                    style={{ width: `${Math.round((progress.index / progress.total) * 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-[11.5px] text-[var(--muted)]">
                    {progress.index}/{progress.total} · {phaseKey ? t(locale, phaseKey) : progress.label}
                  </p>
                  {onCancel ? (
                    <RippleButton
                      onClick={onCancel}
                      className="cs-hover-brass shrink-0 rounded px-1.5 py-0.5 text-[11px] text-[var(--brass)]"
                    >
                      {t(locale, "cancelConnect")}
                    </RippleButton>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex w-full items-center justify-between gap-2">
                <LoaderCircle size={16} className="animate-spin text-[var(--muted)]" />
                {onCancel ? (
                  <RippleButton
                    onClick={onCancel}
                    className="cs-hover-brass shrink-0 rounded px-1.5 py-0.5 text-[11px] text-[var(--brass)]"
                  >
                    {t(locale, "cancelConnect")}
                  </RippleButton>
                ) : null}
              </div>
            )}
          </div>
        ) : scanning ? (
          <div className="flex w-full flex-col items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-6 text-center">
            <LoaderCircle size={16} className="animate-spin text-[var(--muted)]" />
            <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">{t(locale, "setupScanning")}</p>
          </div>
        ) : showEmpty ? (
          <NoAgentSetup locale={locale} onRetry={onRetry} />
        ) : (
          <div className="flex w-full flex-col gap-2.5">
            {agents.map((agent) => (
              <RippleButton
                key={agent.id}
                onClick={() => onSelect(agent.id)}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-[14px] font-medium text-[var(--text)] hover:bg-[var(--hover)]"
              >
                {agent.name}
              </RippleButton>
            ))}
          </div>
        )}

        {error ? <p className="w-full text-center text-[12px] leading-relaxed text-[var(--bad)]">{error}</p> : null}
      </div>
    </div>
  );
}
