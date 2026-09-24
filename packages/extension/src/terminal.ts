import { spawn, type ChildProcess } from "node:child_process";
import * as vscode from "vscode";

/**
 * ACP terminals, backed by real VS Code terminals.
 *
 * The agent asks for `terminal/create` and then polls `terminal/output` or blocks on
 * `terminal/wait_for_exit`. Only the extension can own a `vscode.Terminal`, so the Go host
 * forwards those RPCs here.
 *
 * Preferred path is shell integration: the command runs in the user's own shell, so it has
 * their PATH, history and prompt, and they can type into it. When shell integration never
 * reports ready (an exotic shell, or a VS Code without it) we fall back to spawning the
 * process ourselves and mirroring its output into a read-only pseudoterminal — the user
 * still sees everything, they just cannot type at it.
 */

/** How long to wait for the shell to report integration before falling back. */
const SHELL_INTEGRATION_TIMEOUT_MS = 4000;
/** ACP lets the agent cap retained output; this is what we use when it does not. */
const DEFAULT_OUTPUT_LIMIT = 1 << 20;

export type TerminalState = {
  terminalId: string;
  command: string;
  cwd?: string;
  output: string;
  truncated: boolean;
  running: boolean;
  exitCode?: number;
  signal?: string;
};

type EnvVariable = { name: string; value: string };

type CreateParams = {
  command?: string;
  args?: string[];
  env?: EnvVariable[];
  cwd?: string | null;
  outputByteLimit?: number | null;
};

function quote(part: string): string {
  return /^[\w@%+=:,./-]+$/.test(part) ? part : `'${part.replace(/'/g, `'\\''`)}'`;
}

function commandLineOf(params: CreateParams): string {
  const args = params.args ?? [];
  return [params.command ?? "", ...args.map(quote)].join(" ").trim();
}

/** Waits for a terminal to expose shell integration, or gives up. */
function whenShellIntegration(terminal: vscode.Terminal): Promise<vscode.TerminalShellIntegration | undefined> {
  if (terminal.shellIntegration) return Promise.resolve(terminal.shellIntegration);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      resolve(undefined);
    }, SHELL_INTEGRATION_TIMEOUT_MS);
    const subscription = vscode.window.onDidChangeTerminalShellIntegration((event) => {
      if (event.terminal !== terminal) return;
      clearTimeout(timer);
      subscription.dispose();
      resolve(event.shellIntegration);
    });
  });
}

class AcpTerminal {
  readonly state: TerminalState;
  private readonly limit: number;
  private terminal: vscode.Terminal | undefined;
  private child: ChildProcess | undefined;
  private exited: Promise<void>;
  private markExited!: () => void;
  private readonly onChange: () => void;

  constructor(terminalId: string, params: CreateParams, onChange: () => void) {
    this.limit = params.outputByteLimit ?? DEFAULT_OUTPUT_LIMIT;
    this.onChange = onChange;
    this.state = {
      terminalId,
      command: commandLineOf(params),
      cwd: params.cwd ?? undefined,
      output: "",
      truncated: false,
      running: true,
    };
    this.exited = new Promise((resolve) => {
      this.markExited = resolve;
    });
  }

  async start(params: CreateParams): Promise<void> {
    const env: Record<string, string> = {};
    for (const item of params.env ?? []) env[item.name] = item.value;

    const terminal = vscode.window.createTerminal({
      name: this.state.command.slice(0, 40) || "OpenSider",
      cwd: params.cwd ?? undefined,
      env: Object.keys(env).length > 0 ? env : undefined,
      isTransient: true,
    });
    this.terminal = terminal;

    const integration = await whenShellIntegration(terminal);
    if (integration) {
      void this.runWithShellIntegration(integration);
      return;
    }
    terminal.dispose();
    this.terminal = undefined;
    this.runDetached(params, env);
  }

  private async runWithShellIntegration(integration: vscode.TerminalShellIntegration): Promise<void> {
    try {
      const execution = integration.executeCommand(this.state.command);
      for await (const chunk of execution.read()) this.append(chunk);
      const ended = await new Promise<vscode.TerminalShellExecutionEndEvent | undefined>((resolve) => {
        const subscription = vscode.window.onDidEndTerminalShellExecution((event) => {
          if (event.execution !== execution) return;
          subscription.dispose();
          resolve(event);
        });
      });
      this.finish(ended?.exitCode ?? 0);
    } catch (error) {
      this.append(`\n${error instanceof Error ? error.message : String(error)}\n`);
      this.finish(1);
    }
  }

  /**
   * No shell integration: run the command ourselves and mirror it into a read-only
   * terminal, so "open in terminal" still lands somewhere real.
   */
  private runDetached(params: CreateParams, env: Record<string, string>): void {
    const writer = new vscode.EventEmitter<string>();
    const closer = new vscode.EventEmitter<number>();
    const pty: vscode.Pseudoterminal = {
      onDidWrite: writer.event,
      onDidClose: closer.event,
      open: () => {
        if (this.state.output) writer.fire(this.state.output.replace(/\n/g, "\r\n"));
      },
      close: () => undefined,
    };
    this.terminal = vscode.window.createTerminal({
      name: this.state.command.slice(0, 40) || "OpenSider",
      pty,
    });

    const child = spawn(this.state.command, {
      shell: true,
      cwd: params.cwd ?? undefined,
      env: { ...process.env, ...env },
    });
    this.child = child;

    const pipe = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      this.append(text);
      writer.fire(text.replace(/\n/g, "\r\n"));
    };
    child.stdout?.on("data", pipe);
    child.stderr?.on("data", pipe);
    child.on("error", (error) => {
      this.append(`${error.message}\n`);
      writer.fire(`${error.message}\r\n`);
    });
    child.on("exit", (code, signal) => {
      this.state.signal = signal ?? undefined;
      this.finish(code ?? 0);
      closer.fire(code ?? 0);
    });
  }

  private append(text: string): void {
    this.state.output += text;
    // ACP: truncate from the front, on a character boundary.
    if (Buffer.byteLength(this.state.output, "utf8") > this.limit) {
      const buffer = Buffer.from(this.state.output, "utf8");
      this.state.output = buffer.subarray(buffer.length - this.limit).toString("utf8");
      const firstNewline = this.state.output.indexOf("\n");
      if (firstNewline > 0) this.state.output = this.state.output.slice(firstNewline + 1);
      this.state.truncated = true;
    }
    this.onChange();
  }

  private finish(exitCode: number): void {
    if (!this.state.running) return;
    this.state.running = false;
    this.state.exitCode = exitCode;
    this.onChange();
    this.markExited();
  }

  output(): { output: string; truncated: boolean; exitStatus?: { exitCode: number; signal?: string } } {
    return {
      output: this.state.output,
      truncated: this.state.truncated,
      exitStatus: this.state.running
        ? undefined
        : { exitCode: this.state.exitCode ?? 0, signal: this.state.signal },
    };
  }

  async waitForExit(): Promise<{ exitCode: number; signal?: string }> {
    await this.exited;
    return { exitCode: this.state.exitCode ?? 0, signal: this.state.signal };
  }

  kill(): void {
    this.child?.kill();
    // Shell integration has no kill handle; disposing the terminal ends the command.
    if (!this.child) this.terminal?.dispose();
    this.finish(this.state.exitCode ?? 130);
  }

  /** Release drops the terminal but keeps nothing: ACP says output is gone after this. */
  release(): void {
    this.kill();
    this.terminal?.dispose();
    this.terminal = undefined;
  }

  show(): boolean {
    if (!this.terminal) return false;
    this.terminal.show(false);
    return true;
  }
}

export class TerminalRegistry {
  private readonly terminals = new Map<string, AcpTerminal>();
  private next = 1;

  constructor(private readonly onState: (state: TerminalState) => void) {}

  /** Handles one `terminal/*` RPC. Returns the JSON-RPC result payload. */
  async handle(method: string, params: Record<string, unknown>): Promise<unknown> {
    const terminalId = typeof params.terminalId === "string" ? params.terminalId : "";
    if (method === "terminal/create") {
      const id = `t${this.next++}`;
      const terminal = new AcpTerminal(id, params as CreateParams, () => this.onState(this.terminals.get(id)!.state));
      this.terminals.set(id, terminal);
      this.onState(terminal.state);
      await terminal.start(params as CreateParams);
      return { terminalId: id };
    }
    const terminal = this.terminals.get(terminalId);
    if (!terminal) throw new Error(`unknown terminal ${terminalId}`);
    if (method === "terminal/output") return terminal.output();
    if (method === "terminal/wait_for_exit") return { exitStatus: await terminal.waitForExit() };
    if (method === "terminal/kill") {
      terminal.kill();
      return {};
    }
    if (method === "terminal/release") {
      terminal.release();
      this.terminals.delete(terminalId);
      return {};
    }
    throw new Error(`unsupported terminal method ${method}`);
  }

  /** Reveals the VS Code terminal for a command card. False when there is none. */
  show(terminalId: string): boolean {
    return this.terminals.get(terminalId)?.show() ?? false;
  }

  dispose(): void {
    for (const terminal of this.terminals.values()) terminal.release();
    this.terminals.clear();
  }
}
