import type { AttachmentKind } from "@shared";
import { File, Folder, Image, Wand2 } from "lucide-react";
import { mentionLabel, mentionTitle, parseMentionSegments, type MentionChip as Mention } from "../mentions";

export function kindIcon(kind: AttachmentKind) {
  if (kind === "image") return Image;
  if (kind === "folder") return Folder;
  return File;
}

export function MentionIcon({ mention }: { mention: Mention }) {
  if (mention.kind === "skill") return <Wand2 size={12} className="shrink-0 opacity-80" />;
  if (mention.kind === "tab") return <File size={12} className="shrink-0 opacity-80" />;
  const Icon = kindIcon(mention.fileKind);
  return <Icon size={12} className="shrink-0 opacity-80" />;
}

export function MentionChip({ mention, className = "" }: { mention: Mention; className?: string }) {
  return (
    <span title={mentionTitle(mention)} className={`cs-mention-chip ${className}`}>
      <MentionIcon mention={mention} />
      <span className="cs-mention-chip-label truncate">{mentionLabel(mention)}</span>
    </span>
  );
}

export function UserRichText({ text }: { text: string }) {
  const segments = parseMentionSegments(text);
  if (segments.length === 0) return null;
  return (
    <div className="whitespace-pre-wrap break-words leading-[1.5]">
      {segments.map((segment, index) =>
        segment.type === "text" ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <MentionChip key={`${index}-${mentionLabel(segment.mention)}`} mention={segment.mention} />
        ),
      )}
    </div>
  );
}
