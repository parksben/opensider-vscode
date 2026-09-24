import type { ContextUsage } from "@shared";
import type { ChatMessage, ChatPart, ToolPart, ToolStatus } from "./chat-types";
import { isBenignStreamCloseText, stripBenignStreamClose } from "./stream-close";
import { withPrimaryArg } from "./tool-label";

function id(): string {
  return crypto.randomUUID();
}

function lastAssistant(
  messages: ChatMessage[],
  model?: { modelId?: string; modelName?: string },
): { messages: ChatMessage[]; index: number } {
  const last = messages[messages.length - 1];
  if (last?.role === "assistant" && last.durationMs == null) {
    const hasOwn = Boolean(last.modelId || last.modelName);
    const hasIncoming = Boolean(model?.modelId || model?.modelName);
    const stamped = hasOwn || !hasIncoming ? last : { ...last, modelId: model?.modelId, modelName: model?.modelName };
    const copy = [...messages];
    copy[copy.length - 1] = stamped;
    return { messages: copy, index: copy.length - 1 };
  }
  const created: ChatMessage = {
    id: id(),
    role: "assistant",
    content: [],
    createdAt: new Date(),
    modelId: model?.modelId,
    modelName: model?.modelName,
  };
  return { messages: [...messages, created], index: messages.length };
}

function replacePart(message: ChatMessage, index: number, part: ChatPart): ChatMessage {
  const content = message.content.slice();
  content[index] = part;
  return { ...message, content };
}

function visibleAcpText(update: Record<string, unknown>): string {
  const raw = String((update.content as { text?: string } | undefined)?.text ?? "");
  return isBenignStreamCloseText(raw) ? stripBenignStreamClose(raw) : raw;
}

function appendText(parts: ChatPart[], type: "text" | "reasoning", text: string): ChatPart[] {
  const last = parts[parts.length - 1];
  if (last && last.type === type) {
    return [...parts.slice(0, -1), { ...last, text: last.text + text }];
  }
  return [...parts, { type, text }];
}

function findTool(messages: ChatMessage[], toolCallId: string): { messageIndex: number; partIndex: number } | undefined {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    const partIndex = message.content.findIndex(
      (part) => part.type === "tool-call" && part.toolCallId === toolCallId,
    );
    if (partIndex >= 0) return { messageIndex, partIndex };
  }
  return undefined;
}

/** ACP `usage_update`: how full the model's context window is right now. */
export function usageFromUpdate(update: Record<string, unknown>): ContextUsage | undefined {
  if (String(update.sessionUpdate ?? "") !== "usage_update") return undefined;
  const used = Number(update.used);
  const size = Number(update.size);
  if (!Number.isFinite(used) || !Number.isFinite(size) || size <= 0) return undefined;
  const rawCost = update.cost as { amount?: unknown; currency?: unknown } | undefined;
  const amount = Number(rawCost?.amount);
  return {
    used,
    size,
    cost: Number.isFinite(amount)
      ? { amount, currency: typeof rawCost?.currency === "string" ? rawCost.currency : undefined }
      : undefined,
  };
}

/**
 * ACP embeds a terminal in a tool call as `content: [{ type: "terminal", terminalId }]`.
 * That id is what links the card to the live VS Code terminal.
 */
function terminalIdOf(update: Record<string, unknown>): string | undefined {
  const direct = update.terminalId;
  if (typeof direct === "string" && direct) return direct;
  const content = update.content;
  if (!Array.isArray(content)) return undefined;
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (record.type === "terminal" && typeof record.terminalId === "string") return record.terminalId;
  }
  return undefined;
}

export function applyAcpUpdate(
  messages: ChatMessage[],
  update: Record<string, unknown>,
  model?: { modelId?: string; modelName?: string },
): ChatMessage[] {
  const kind = String(update.sessionUpdate ?? "");

  if (kind === "user_message_chunk") {
    return messages;
  }

  if (kind === "agent_message_chunk") {
    const text = visibleAcpText(update);
    if (!text) return messages;
    const next = lastAssistant(messages, model);
    const message = next.messages[next.index];
    const updated = { ...message, content: appendText(message.content, "text", text) };
    next.messages[next.index] = updated;
    return next.messages;
  }

  if (kind === "agent_thought_chunk") {
    const text = visibleAcpText(update);
    if (!text) return messages;
    const next = lastAssistant(messages, model);
    const message = next.messages[next.index];
    const updated = { ...message, content: appendText(message.content, "reasoning", text) };
    next.messages[next.index] = updated;
    return next.messages;
  }

  if (kind === "tool_call") {
    const tool = withPrimaryArg({
      type: "tool-call",
      toolCallId: String(update.toolCallId ?? id()),
      toolName: String(update.title ?? update.kind ?? "tool"),
      args: update.rawInput ?? update.input ?? {},
      result: update.rawOutput,
      status: (update.status as ToolStatus | undefined) ?? "pending",
      kind: update.kind ? String(update.kind) : undefined,
      terminalId: terminalIdOf(update),
    });
    const next = lastAssistant(messages, model);
    const message = next.messages[next.index];
    next.messages[next.index] = { ...message, content: [...message.content, tool] };
    return next.messages;
  }

  if (kind === "tool_call_update") {
    const toolCallId = String(update.toolCallId ?? "");
    const found = findTool(messages, toolCallId);
    if (!found) {
      return applyAcpUpdate(messages, { ...update, sessionUpdate: "tool_call" }, model);
    }
    const message = messages[found.messageIndex];
    const current = message.content[found.partIndex] as ToolPart;
    const patched = withPrimaryArg({
      ...current,
      toolName: update.title ? String(update.title) : current.toolName,
      args: update.rawInput ?? update.input ?? current.args,
      result: update.rawOutput ?? update.content ?? current.result,
      status: (update.status as ToolStatus | undefined) ?? current.status,
      kind: update.kind ? String(update.kind) : current.kind,
      terminalId: terminalIdOf(update) ?? current.terminalId,
    });
    const copy = messages.slice();
    copy[found.messageIndex] = replacePart(message, found.partIndex, patched);
    return copy;
  }

  return messages;
}

export function createUserMessage(text: string, attachments?: ChatMessage["attachments"]): ChatMessage {
  return {
    id: id(),
    role: "user",
    content: [{ type: "text", text }],
    createdAt: new Date(),
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
  };
}
