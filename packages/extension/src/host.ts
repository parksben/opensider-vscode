import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export type HostMessage = Record<string, unknown> & { type?: string };

export class HostProcess {
  private child: ChildProcessWithoutNullStreams | undefined;
  private buffer = Buffer.alloc(0);
  private onMessage: (message: HostMessage) => void;
  private onExit: (error?: string) => void;

  constructor(handlers: { onMessage: (message: HostMessage) => void; onExit: (error?: string) => void }) {
    this.onMessage = handlers.onMessage;
    this.onExit = handlers.onExit;
  }

  start(binary: string): void {
    this.stop();
    if (!existsSync(binary)) {
      this.onExit(`找不到宿主程序：${binary}`);
      return;
    }
    const child = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    child.stdout.on("data", (chunk: Buffer) => this.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      const line = chunk.toString("utf8").trim();
      if (line) this.onMessage({ type: "host.stderr", error: line });
    });
    child.on("error", (error) => this.onExit(error.message));
    child.on("exit", (code) => {
      this.child = undefined;
      if (code && code !== 0) this.onExit(`宿主已退出（${code}）`);
    });
  }

  send(message: HostMessage): void {
    if (!this.child) return;
    const body = Buffer.from(JSON.stringify(message), "utf8");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length, 0);
    this.child.stdin.write(Buffer.concat([header, body]));
  }

  stop(): void {
    const child = this.child;
    this.child = undefined;
    this.buffer = Buffer.alloc(0);
    child?.kill();
  }

  private push(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length <= 0 || length > 8 * 1024 * 1024) {
        this.onExit("宿主消息长度异常");
        this.stop();
        return;
      }
      if (this.buffer.length < 4 + length) return;
      const body = this.buffer.subarray(4, 4 + length).toString("utf8");
      this.buffer = this.buffer.subarray(4 + length);
      try {
        this.onMessage(JSON.parse(body) as HostMessage);
      } catch (error) {
        this.onMessage({ type: "host.stderr", error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
}

export function hostBinary(extensionPath: string): string {
  const override = process.env.OPENSIDER_VSCODE_HOST;
  if (override && existsSync(override)) return override;
  const name = process.platform === "win32" ? "opensider-vscode-host.exe" : "opensider-vscode-host";
  return path.join(extensionPath, "bin", name);
}
