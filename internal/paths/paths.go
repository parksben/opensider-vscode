package paths

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

func Home() string {
	if h := os.Getenv("HOME"); h != "" {
		return h
	}
	if h := os.Getenv("USERPROFILE"); h != "" {
		return h
	}
	if h, err := os.UserHomeDir(); err == nil && h != "" {
		return h
	}
	return ""
}

func SidebarHome() string {
	return filepath.Join(Home(), ".opensider-vscode")
}

var (
	workspaceMu   sync.RWMutex
	workspaceDir  string
	workspaceKey  string
	workspaceName string
)

// SetWorkspace records the VS Code window's workspace.
//
// `dir` is the cwd an ACP session runs in; in a multi-root workspace it follows the
// active editor, so it is **not** a stable identity. `key` is that stable identity (the
// `.code-workspace` file, or the first folder) and is the only thing state buckets are
// keyed on — otherwise switching tabs between two roots would switch chat histories.
func SetWorkspace(dir, key, name string) {
	workspaceMu.Lock()
	workspaceDir = cleanDir(dir)
	workspaceKey = cleanDir(key)
	workspaceName = strings.TrimSpace(name)
	workspaceMu.Unlock()
}

func cleanDir(dir string) string {
	trimmed := strings.TrimSpace(dir)
	if trimmed == "" {
		return ""
	}
	return filepath.Clean(trimmed)
}

func WorkspaceDir() string {
	workspaceMu.RLock()
	defer workspaceMu.RUnlock()
	return workspaceDir
}

// WorkspaceKey is the stable identity of this window's workspace, or "" when the window
// has no folder open.
func WorkspaceKey() string {
	workspaceMu.RLock()
	defer workspaceMu.RUnlock()
	return workspaceKey
}

func WorkspaceName() string {
	workspaceMu.RLock()
	defer workspaceMu.RUnlock()
	return workspaceName
}

// WorkspacesDir holds one directory per workspace the user has chatted in.
func WorkspacesDir() string { return filepath.Join(SidebarHome(), "workspaces") }

// BucketName maps a workspace identity to its directory name under WorkspacesDir.
//
// The hash is what makes it collision-free and filesystem-safe; the slug in front of it
// is purely so a human can `ls ~/.opensider-vscode/workspaces` and recognise the place.
// Never parse the slug back — it is lossy on purpose.
func BucketName(key, name string) string {
	key = cleanDir(key)
	if key == "" {
		return ""
	}
	// macOS and Windows resolve paths case-insensitively, so two windows that spell the
	// same folder differently must land in the same bucket.
	hashed := key
	if runtime.GOOS == "darwin" || runtime.GOOS == "windows" {
		hashed = strings.ToLower(hashed)
	}
	sum := sha256.Sum256([]byte(hashed))
	digest := hex.EncodeToString(sum[:])[:12]

	label := strings.TrimSpace(name)
	if label == "" {
		label = filepath.Base(key)
	}
	return slug(label) + "-" + digest
}

// slug reduces a workspace's display name to something safe in a directory name on every
// platform: ASCII word characters only, no leading/trailing dashes, bounded length.
func slug(label string) string {
	var b strings.Builder
	lastDash := true
	for _, r := range label {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		case r == '.' || r == '_' || r == '-':
			if !lastDash {
				b.WriteByte('-')
				lastDash = true
			}
		default:
			// Non-ASCII (a CJK project name, say) has no safe short form; the hash
			// carries the identity, so collapse it to a separator.
			if !lastDash {
				b.WriteByte('-')
				lastDash = true
			}
		}
		if b.Len() >= 40 {
			break
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "workspace"
	}
	return out
}

// WorkspaceStateDir is this window's bucket, or "" when no folder is open.
func WorkspaceStateDir() string {
	bucket := BucketName(WorkspaceKey(), WorkspaceName())
	if bucket == "" {
		return ""
	}
	return filepath.Join(WorkspacesDir(), bucket)
}

// WorkspaceUIStatePath is the per-workspace chat state, or "" when no folder is open.
func WorkspaceUIStatePath() string {
	dir := WorkspaceStateDir()
	if dir == "" {
		return ""
	}
	return filepath.Join(dir, "ui-state.json")
}

// WorkspaceMetaPath records which workspace a bucket belongs to, so the hashed directory
// name is not the only way to tell.
func WorkspaceMetaPath() string {
	dir := WorkspaceStateDir()
	if dir == "" {
		return ""
	}
	return filepath.Join(dir, "workspace.json")
}

// GlobalStatePath holds the preferences that are the same in every window.
func GlobalStatePath() string { return filepath.Join(SidebarHome(), "global-state.json") }

func WriteSessionID(id string) {
	if err := os.MkdirAll(SidebarHome(), 0o755); err != nil {
		return
	}
	_ = os.WriteFile(SessionPath(), []byte(strings.TrimSpace(id)+"\n"), 0o644)
}
func SessionPath() string { return filepath.Join(SidebarHome(), "session.json") }
func HostLogPath() string { return filepath.Join(SidebarHome(), "host.log") }

// LegacyUIStatePath is the single global state file used before state was split per
// workspace. It only exists until the one-time migration consumes it.
func LegacyUIStatePath() string { return filepath.Join(SidebarHome(), "ui-state.json") }

// LegacyClaimPath is where the migration atomically moves the legacy file to claim it.
// Renaming is the claim: exactly one host can win it, and no lock is left behind if that
// host is then killed.
func LegacyClaimPath() string { return filepath.Join(SidebarHome(), "ui-state.json.migrating") }

func RuntimeDir() string { return filepath.Join(SidebarHome(), "runtime") }

// AgentNativeDir is a stable TMPDIR for one Agent CLI so macOS Gatekeeper does not
// treat every extract of the same .node as a new file.
func AgentNativeDir(agentID string) string {
	id := strings.TrimSpace(agentID)
	if id == "" {
		id = "agent"
	}
	return filepath.Join(RuntimeDir(), "natives", id)
}

// ClaudeACPDir is the prefix-local install root for @agentclientprotocol/claude-agent-acp.
func ClaudeACPDir() string { return filepath.Join(RuntimeDir(), "claude-acp") }

// ClaudeACPBinDir is that prefix's node_modules/.bin (claude-agent-acp shims).
func ClaudeACPBinDir() string { return filepath.Join(ClaudeACPDir(), "node_modules", ".bin") }

// CodexACPDir is the prefix-local install root for @agentclientprotocol/codex-acp.
func CodexACPDir() string { return filepath.Join(RuntimeDir(), "codex-acp") }

// CodexACPBinDir is that prefix's node_modules/.bin (codex-acp shims).
func CodexACPBinDir() string { return filepath.Join(CodexACPDir(), "node_modules", ".bin") }

func DefaultAgentPath() string {
	if p := os.Getenv("CURSOR_AGENT_PATH"); p != "" {
		return p
	}
	name := "agent"
	if runtime.GOOS == "windows" {
		name = "agent.exe"
	}
	return filepath.Join(Home(), ".local", "bin", name)
}

func considerDir(dirs *[]string, seen map[string]bool, dir string) {
	if dir == "" || seen[dir] {
		return
	}
	if st, err := os.Stat(dir); err != nil || !st.IsDir() {
		return
	}
	seen[dir] = true
	*dirs = append(*dirs, dir)
}

func versionManagerBins() []string {
	home := Home()
	var dirs []string
	seen := map[string]bool{}
	consider := func(dir string) { considerDir(&dirs, seen, dir) }

	consider(filepath.Join(home, ".local", "bin"))
	consider(filepath.Join(home, ".opencode", "bin"))
	consider(filepath.Join(home, ".npm-global", "bin"))
	consider(filepath.Join(home, ".npm-global"))
	consider(filepath.Join(home, ".bun", "bin"))
	consider(filepath.Join(home, ".volta", "bin"))
	consider(filepath.Join(home, ".asdf", "shims"))
	consider(filepath.Join(home, ".cargo", "bin"))
	consider(filepath.Join(home, "Library", "pnpm"))
	consider(filepath.Join(SidebarHome(), "runtime", "bin"))
	consider("/opt/homebrew/bin")
	consider("/usr/local/bin")
	consider("/usr/bin")
	consider("/home/linuxbrew/.linuxbrew/bin")

	if runtime.GOOS == "windows" {
		if local := os.Getenv("LOCALAPPDATA"); local != "" {
			consider(filepath.Join(local, "fnm"))
			consider(filepath.Join(local, "Programs", "fnm"))
			consider(filepath.Join(local, "Yarn", "bin"))
		}
		if roaming := os.Getenv("APPDATA"); roaming != "" {
			consider(filepath.Join(roaming, "npm"))
			consider(filepath.Join(roaming, "fnm"))
		}
		consider(filepath.Join(home, "scoop", "shims"))
		consider(filepath.Join(home, "AppData", "Roaming", "npm"))
		if nvm := os.Getenv("NVM_HOME"); nvm != "" {
			consider(nvm)
		}
		if link := os.Getenv("NVM_SYMLINK"); link != "" {
			consider(link)
		}
		consider(`C:\Program Files\nodejs`)
		consider(`C:\Program Files (x86)\nodejs`)
	}

	nvmRoot := os.Getenv("NVM_DIR")
	if nvmRoot == "" {
		nvmRoot = filepath.Join(home, ".nvm")
	}
	consider(filepath.Join(nvmRoot, "current", "bin"))
	nvmVersions := filepath.Join(nvmRoot, "versions", "node")
	if entries, err := os.ReadDir(nvmVersions); err == nil {
		for i := len(entries) - 1; i >= 0; i-- {
			name := entries[i].Name()
			consider(filepath.Join(nvmVersions, name, "bin"))
		}
	}

	fnmHome := os.Getenv("FNM_DIR")
	if fnmHome == "" {
		fnmHome = filepath.Join(home, ".fnm")
	}
	consider(filepath.Join(fnmHome, "current", "bin"))
	fnmCandidates := []string{
		filepath.Join(home, "Library", "Application Support", "fnm", "node-versions"),
		filepath.Join(home, ".local", "share", "fnm", "node-versions"),
		filepath.Join(fnmHome, "node-versions"),
	}
	if local := os.Getenv("LOCALAPPDATA"); local != "" {
		fnmCandidates = append(fnmCandidates, filepath.Join(local, "fnm", "node-versions"))
	}
	for _, root := range fnmCandidates {
		entries, err := os.ReadDir(root)
		if err != nil {
			continue
		}
		for i := len(entries) - 1; i >= 0; i-- {
			name := entries[i].Name()
			consider(filepath.Join(root, name, "installation", "bin"))
			consider(filepath.Join(root, name, "bin"))
		}
	}

	return dirs
}

func AgentSearchDirs() []string {
	fromEnv := filepath.SplitList(os.Getenv("PATH"))
	seen := map[string]bool{}
	var out []string
	// Always include the OpenSider-owned ACP prefixes so detect finds the
	// adapters even if the directory was just created (considerDir would skip it).
	ours := []string{ClaudeACPBinDir(), CodexACPBinDir()}
	for _, dir := range append(ours, append(versionManagerBins(), fromEnv...)...) {
		if dir == "" || seen[dir] {
			continue
		}
		seen[dir] = true
		out = append(out, dir)
	}
	return out
}

func AgentPathEnv(command string) string {
	dirs := AgentSearchDirs()
	if command != "" {
		dir := filepath.Dir(command)
		if dir != "" && dir != "." {
			dirs = append([]string{dir}, dirs...)
		}
	}
	seen := map[string]bool{}
	var uniq []string
	for _, dir := range dirs {
		if dir == "" || seen[dir] {
			continue
		}
		seen[dir] = true
		uniq = append(uniq, dir)
	}
	return strings.Join(uniq, string(os.PathListSeparator))
}

func PathExts() []string {
	if runtime.GOOS != "windows" {
		return []string{""}
	}
	raw := os.Getenv("PATHEXT")
	if raw == "" {
		raw = ".COM;.EXE;.BAT;.CMD"
	}
	var exts []string
	seen := map[string]bool{"": true}
	exts = append(exts, "")
	for _, part := range strings.Split(raw, ";") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if !strings.HasPrefix(part, ".") {
			part = "." + part
		}
		key := strings.ToLower(part)
		if seen[key] {
			continue
		}
		seen[key] = true
		exts = append(exts, part)
	}
	return exts
}
