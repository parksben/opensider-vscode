import type { TerminalState } from "@shared";
import { createContext, useContext } from "react";

/**
 * Live terminal state, keyed by `terminalId`.
 *
 * Command cards sit four levels below the panel root, and the state is panel-wide rather
 * than per-message, so it travels by context instead of being threaded through every
 * message renderer.
 */
export const TerminalsContext = createContext<Record<string, TerminalState>>({});

export function useTerminal(terminalId?: string): TerminalState | undefined {
  const terminals = useContext(TerminalsContext);
  return terminalId ? terminals[terminalId] : undefined;
}
