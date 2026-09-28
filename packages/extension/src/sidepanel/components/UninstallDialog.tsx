import type { Locale } from "../i18n";
import { t } from "../i18n";
import { extensionUninstallPrompt } from "../update-prompt";
import { PromptDialog } from "./PromptDialog";

/**
 * The settings tab's "Uninstall" modal: same shell as the update dialog, only the prompt
 * changes. Nothing is removed here — the user's own agent runs the removal from the skill.
 */
export function UninstallDialog({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const label = (key: Parameters<typeof t>[1]) => t(locale, key);

  return (
    <PromptDialog
      locale={locale}
      title={label("uninstallDialogTitle")}
      hint={label("uninstallDialogHint")}
      prompt={extensionUninstallPrompt(locale)}
      copyLabel={label("copyUninstallPrompt")}
      onClose={onClose}
    />
  );
}
