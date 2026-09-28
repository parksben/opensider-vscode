import type { Locale } from "./i18n";

const UPDATE_SKILL_URL =
  "https://raw.githubusercontent.com/parksben/opensider-vscode/main/skills/opensider-vscode/update.md";

/** Two lines: intent, then the skill the user's own agent should follow. */
export function extensionUpdatePrompt(locale: Locale): string {
  if (locale === "zh") {
    return [
      "帮我更新 OpenSider for VSCode。",
      `请先读取 ${UPDATE_SKILL_URL}，按其更新流程执行。`,
    ].join("\n");
  }
  return [
    "Update the OpenSider for VSCode extension for me.",
    `Read ${UPDATE_SKILL_URL} and follow its update flow.`,
  ].join("\n");
}
