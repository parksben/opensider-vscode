import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/** Unpacked id, then the historical packed id. Either one means the browser extension is present. */
const EXTENSION_IDS = ["gcblddgaifebccglndkaccmibhechimj", "clnpnldmjaklambmaglpckjlgkicmcpb"];

/** Skip preference files large enough that a click would stall the extension host. */
const MAX_PREF_BYTES = 32 * 1024 * 1024;

export function browserUserDataRoots(home = homedir()): string[] {
  if (process.platform === "darwin") {
    const app = path.join(home, "Library", "Application Support");
    return [
      path.join(app, "Google", "Chrome"),
      path.join(app, "Google", "Chrome Beta"),
      path.join(app, "Google", "Chrome Canary"),
      path.join(app, "Google", "Chrome Dev"),
      path.join(app, "Chromium"),
      path.join(app, "Microsoft Edge"),
      path.join(app, "Microsoft Edge Beta"),
      path.join(app, "Microsoft Edge Dev"),
      path.join(app, "Microsoft Edge Canary"),
      path.join(app, "BraveSoftware", "Brave-Browser"),
      path.join(app, "BraveSoftware", "Brave-Browser-Beta"),
      path.join(app, "BraveSoftware", "Brave-Browser-Nightly"),
      path.join(app, "Arc", "User Data"),
    ];
  }
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    return [
      path.join(local, "Google", "Chrome", "User Data"),
      path.join(local, "Google", "Chrome Beta", "User Data"),
      path.join(local, "Google", "Chrome SxS", "User Data"),
      path.join(local, "Chromium", "User Data"),
      path.join(local, "Microsoft", "Edge", "User Data"),
      path.join(local, "Microsoft", "Edge Beta", "User Data"),
      path.join(local, "Microsoft", "Edge Dev", "User Data"),
      path.join(local, "BraveSoftware", "Brave-Browser", "User Data"),
      path.join(local, "Arc", "User Data"),
    ];
  }
  const config = path.join(home, ".config");
  return [
    path.join(config, "google-chrome"),
    path.join(config, "google-chrome-beta"),
    path.join(config, "google-chrome-unstable"),
    path.join(config, "chromium"),
    path.join(config, "microsoft-edge"),
    path.join(config, "microsoft-edge-beta"),
    path.join(config, "microsoft-edge-dev"),
    path.join(config, "BraveSoftware", "Brave-Browser"),
    path.join(config, "BraveSoftware", "Brave-Browser-Beta"),
  ];
}

/** True when a Chromium profile on this machine has the OpenSider browser extension installed. */
export function browserExtensionInstalled(roots = browserUserDataRoots()): boolean {
  for (const root of roots) {
    if (profileHasExtension(root)) return true;
    let names: string[] = [];
    try {
      names = readdirSync(root);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name !== "Default" && name !== "Guest Profile" && !name.startsWith("Profile ")) continue;
      if (profileHasExtension(path.join(root, name))) return true;
    }
  }
  return false;
}

function profileHasExtension(profile: string): boolean {
  for (const id of EXTENSION_IDS) {
    if (existsSync(path.join(profile, "Extensions", id))) return true;
    if (existsSync(path.join(profile, "Local Extension Settings", id))) return true;
  }
  for (const name of ["Preferences", "Secure Preferences"]) {
    const file = path.join(profile, name);
    try {
      if (statSync(file).size > MAX_PREF_BYTES) continue;
      const text = readFileSync(file, "utf8");
      if (EXTENSION_IDS.some((id) => text.includes(id))) return true;
    } catch {
      // missing or unreadable profile file
    }
  }
  return false;
}
