import type { AttachmentItem, AttachmentKind, SkillItem } from "@shared";

/** A file the user picked from the editor tab strip in the `@` menu. */
export type TabMention = {
  kind: "tab";
  path: string;
  relativePath: string;
  name: string;
};

export type AttachmentMention = {
  kind: "attachment";
  path: string;
  name: string;
  fileKind: AttachmentKind;
};

/**
 * A skill the user picked in the probe menu. `name` is the identifier the CLIs know (the
 * menu may show a friendlier alias, but this is what goes out).
 */
export type SkillMention = {
  kind: "skill";
  name: string;
};

export type MentionChip = TabMention | AttachmentMention | SkillMention;

export type MentionSegment = { type: "text"; text: string } | { type: "mention"; mention: MentionChip };

const TOKEN_RE = /«@(tab|att):[^»]+»|«\/skill:[^»]+»/g;

function encodePayload(data: unknown): string {
  return encodeURIComponent(JSON.stringify(data));
}

function decodePayload(raw: string): unknown {
  return JSON.parse(decodeURIComponent(raw));
}

export function mentionLabel(mention: MentionChip): string {
  if (mention.kind === "skill") return `/${mention.name}`;
  return mention.kind === "tab" ? mention.relativePath || mention.name : mention.name || mention.path;
}

/** Chips render skill names with a leading slash; everything else keeps the `@` marker. */
function mentionMarker(mention: MentionChip): string {
  // skill 用 `/` 开头，只有文件 / 附件带 `@`。
  return mention.kind === "skill" ? "" : "@";
}

export function mentionTitle(mention: MentionChip): string {
  if (mention.kind === "skill") return `/${mention.name}`;
  return mention.path;
}

export function serializeMention(mention: MentionChip): string {
  if (mention.kind === "skill") {
    return `«/skill:${encodeURIComponent(mention.name)}»`;
  }
  if (mention.kind === "tab") {
    return `«@tab:${encodePayload({
      path: mention.path,
      relativePath: mention.relativePath,
      name: mention.name,
    })}»`;
  }
  return `«@att:${encodePayload({
    path: mention.path,
    name: mention.name,
    kind: mention.fileKind,
  })}»`;
}

export function parseMentionToken(token: string): MentionChip | undefined {
  const skill = /^«\/skill:([^»]+)»$/.exec(token);
  if (skill) {
    let name = "";
    try {
      name = decodeURIComponent(skill[1]).trim();
    } catch {
      return undefined;
    }
    return name ? { kind: "skill", name } : undefined;
  }
  const match = /^«@(tab|att):([^»]+)»$/.exec(token);
  if (!match) return undefined;
  try {
    const data = decodePayload(match[2]) as Record<string, unknown>;
    if (match[1] === "tab") {
      const path = String(data.path ?? "");
      if (!path) return undefined;
      const relativePath = String(data.relativePath ?? "");
      const name = String(data.name ?? "");
      return {
        kind: "tab",
        path,
        relativePath: relativePath || name || path,
        name: name || relativePath || path,
      };
    }
    const path = String(data.path ?? "");
    const name = String(data.name ?? "");
    const kind = data.kind;
    if (!path) return undefined;
    const fileKind: AttachmentKind = kind === "image" || kind === "folder" || kind === "file" ? kind : "file";
    return { kind: "attachment", path, name: name || path, fileKind };
  } catch {
    return undefined;
  }
}

export function parseMentionSegments(text: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  for (const match of text.matchAll(new RegExp(TOKEN_RE.source, "g"))) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ type: "text", text: text.slice(last, index) });
    const mention = parseMentionToken(match[0]);
    if (mention) segments.push({ type: "mention", mention });
    else segments.push({ type: "text", text: match[0] });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ type: "text", text: text.slice(last) });
  return segments;
}

/**
 * 给 Agent 看的形态：内部 token 不该出现在发给模型的提示词里。
 */
export function promptMentionText(text: string): string {
  return parseMentionSegments(text)
    .map((segment) =>
      segment.type === "text" ? segment.text : `${mentionMarker(segment.mention)}${mentionLabel(segment.mention)}`,
    )
    .join("");
}

export function displayMentionText(text: string): string {
  return parseMentionSegments(text)
    .map((segment) =>
      segment.type === "text" ? segment.text : `${mentionMarker(segment.mention)}${mentionLabel(segment.mention)}`,
    )
    .join("");
}

export function mentionsOf(text: string): MentionChip[] {
  return parseMentionSegments(text)
    .filter((segment): segment is { type: "mention"; mention: MentionChip } => segment.type === "mention")
    .map((segment) => segment.mention);
}

export function composerHasContent(text: string): boolean {
  const display = displayMentionText(text).replace(/\u200b/g, "").trim();
  return display.length > 0 || mentionsOf(text).length > 0;
}

function wrapMentionedTabs(mentions: MentionChip[]): string {
  const tabs = mentions.filter((item): item is TabMention => item.kind === "tab");
  if (tabs.length === 0) return "";
  const lines = tabs.map((tab) => `- ${tab.relativePath || tab.name || tab.path}`);
  return `[Mentioned files]\nThe user @-mentioned these files from the current workspace inline. The @names in the message match the paths below.\nRead them if you need their contents.\n${lines.join("\n")}`;
}

function wrapMentionedAttachments(mentions: MentionChip[]): string {
  const items = mentions.filter((item): item is AttachmentMention => item.kind === "attachment");
  if (items.length === 0) return "";
  return `[Mentioned attachments]\nThe user @-mentioned these previously attached files, folders, or images. The @names in the message match the names below.\nRead these local paths if needed.\n${items
    .map((item) => `- ${item.name} — ${item.path} (${item.fileKind})`)
    .join("\n")}`;
}

/**
 * 正文**最前面**那串 skill 芯片的 name，按出现顺序（只算开头连着的一串：中间再插一个
 * skill，它就不在「最前」了，不该当斜杠前缀发出去）。
 */
export function leadingSkillNames(text: string): string[] {
  const names: string[] = [];
  for (const segment of parseMentionSegments(text)) {
    if (segment.type === "mention") {
      if (segment.mention.kind !== "skill") break;
      names.push(segment.mention.name);
      continue;
    }
    if (segment.text.trim() !== "") break;
  }
  return names;
}

/** 把 display 开头那串 `/name` 摘掉，返回剩下的正文。 */
export function stripLeadingSkills(display: string, names: string[]): string {
  let rest = display;
  for (const name of names) {
    const token = `/${name}`;
    if (!rest.startsWith(token)) break;
    rest = rest.slice(token.length).replace(/^\s+/, "");
  }
  return rest;
}

function wrapRequestedSkills(mentions: MentionChip[], skills: SkillItem[]): string {
  const names = [
    ...new Set(mentions.filter((item): item is SkillMention => item.kind === "skill").map((item) => item.name)),
  ];
  if (names.length === 0) return "";
  const lines = names.map((name) => {
    const path = skills.find((skill) => skill.name === name)?.path;
    return path ? `- ${name} — ${path}` : `- ${name}`;
  });
  return `[Skills requested by the user]\nThe user explicitly asked to use these skills. Read each skill's SKILL.md and follow it.\n${lines.join("\n")}`;
}

export function wrapUserMentions(text: string, skills: SkillItem[] = []): { display: string; appendix: string } {
  const mentions = mentionsOf(text);
  const display = promptMentionText(text).replace(/\u200b/g, "").trim();
  const appendix = [
    wrapMentionedTabs(mentions),
    wrapMentionedAttachments(mentions),
    wrapRequestedSkills(mentions, skills),
  ]
    .filter(Boolean)
    .join("\n\n");
  return { display, appendix };
}

export function attachmentToMention(item: AttachmentItem): AttachmentMention {
  return { kind: "attachment", path: item.path, name: item.name, fileKind: item.kind };
}

export function stripAttachmentMentions(text: string, path: string): string {
  if (!path) return text;
  return parseMentionSegments(text)
    .filter(
      (segment) =>
        !(segment.type === "mention" && segment.mention.kind === "attachment" && segment.mention.path === path),
    )
    .map((segment) => (segment.type === "text" ? segment.text : serializeMention(segment.mention)))
    .join("");
}
