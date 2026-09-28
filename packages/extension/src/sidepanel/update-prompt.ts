import type { Locale } from "./i18n";

const SETUP_SKILL_URL =
  "https://raw.githubusercontent.com/parksben/opensider-vscode/main/packages/extension/skills/opensider-vscode/SKILL.md";

/** Two lines: intent, then the skill the user's own agent should follow. */
function prompt(locale: Locale, zhIntent: string, enIntent: string, zhFlow: string, enFlow: string): string {
  if (locale === "zh") return [zhIntent, `请先读取 ${SETUP_SKILL_URL}，按其${zhFlow}执行。`].join("\n");
  return [enIntent, `Read ${SETUP_SKILL_URL} and follow its ${enFlow} flow.`].join("\n");
}

export function extensionInstallPrompt(locale: Locale): string {
  return prompt(locale, "帮我安装 OpenSider for VSCode。", "Install the OpenSider for VSCode extension for me.", "安装流程", "install");
}

export function extensionUpdatePrompt(locale: Locale): string {
  return prompt(locale, "帮我更新 OpenSider for VSCode。", "Update the OpenSider for VSCode extension for me.", "更新流程", "update");
}

export function extensionUninstallPrompt(locale: Locale): string {
  return prompt(locale, "帮我卸载 OpenSider for VSCode。", "Uninstall the OpenSider for VSCode extension for me.", "卸载流程", "removal");
}
