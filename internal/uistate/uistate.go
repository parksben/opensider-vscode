// Package uistate owns the panel's mirrored state on disk.
//
// State is split in two. Chat history belongs to the workspace it was written in, so it
// lives in a per-workspace bucket; preferences that describe the user rather than the
// project live in one global file every window shares. See Split for the full division
// and the reasoning behind each key.
//
// Inside a bucket, ui-state.json is only the index: session metadata, the selection,
// and workspace preferences. Each session's messages (and the other bulky fields) live
// in sessions/<id>.json, so saving one chat does not rewrite every other transcript.
//
// Several VS Code windows run several hosts against the same home directory at once, so
// nothing here may assume it is the only writer:
//
//   - every write is a temp file in the same directory followed by a rename, so a reader
//     sees either the old file or the new one and never a half-written one;
//   - two windows on the *same* workspace merge instead of overwriting, so neither loses
//     the sessions the other created (MergeWorkspace);
//   - a bucket write holds .ui-state.lock for the read-merge-write. The file is removed
//     when the write finishes. A host killed mid-write leaves it behind, and the next
//     writer takes it once it is a minute old, so a dead process never has to release it.
package uistate

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"opensidervscode/internal/paths"
)

// tombstoneTTL is how long a deleted session id is remembered. It only has to outlive
// the staleness of another window's in-memory copy, which ends when that window closes.
const tombstoneTTL = 30 * 24 * time.Hour

// globalKeys are mirrored to global-state.json instead of the workspace bucket.
//
// The split is "does this describe the user, or the project?":
//
//   - theme / locale: how the user reads the panel. Global, obviously.
//   - sessionsOpen / sessionDrawerWidth: panel furniture, same reasoning.
//   - onboardingCompleted: whether an agent has ever been set up on this machine. Per
//     workspace it would re-run onboarding for every new folder.
//   - selectedProviderId / selectedModelId / selectedModelByProvider: which CLI is
//     installed and which model the user likes. A property of the machine and of taste,
//     not of the code being edited.
//   - agentModeByProvider / agentOptionByProvider: the agent's own advertised mode
//     (plan/build/…) and reasoning-effort switches. Working style, so it travels.
//
// agentMode — the *permission* policy (ask / workspace edits / auto / unattended) — is
// deliberately absent, and therefore per-workspace. It is the one setting with real
// blast radius, and how much you trust an agent is a property of the code you point it
// at: unattended in a scratch repo must not silently become unattended in production.
var globalKeys = []string{
	"theme",
	"locale",
	"sessionsOpen",
	"sessionDrawerWidth",
	"onboardingCompleted",
	"selectedProviderId",
	"selectedModelId",
	"selectedModelByProvider",
	"agentModeByProvider",
	"agentOptionByProvider",
}

// mergeableMaps are global keys whose value is a provider-keyed map. Merging them key by
// key rather than wholesale means a window that only knows about one provider cannot
// drop another window's choice for a different provider.
var mergeableMaps = map[string]bool{
	"selectedModelByProvider": true,
	"agentModeByProvider":     true,
	"agentOptionByProvider":   true,
}

func isGlobalKey(key string) bool {
	for _, candidate := range globalKeys {
		if candidate == key {
			return true
		}
	}
	return false
}

// Split divides one panel state into the part that belongs to the current workspace and
// the part that is shared by every window. It is pure so the division can be tested
// without a filesystem.
func Split(state map[string]any) (workspace, global map[string]any) {
	workspace = map[string]any{}
	global = map[string]any{}
	for key, value := range state {
		if isGlobalKey(key) {
			global[key] = value
			continue
		}
		workspace[key] = value
	}
	// Both halves are read back independently, so both need the envelope.
	for _, key := range []string{"version", "savedAt"} {
		if value, ok := state[key]; ok {
			global[key] = value
		}
	}
	return workspace, global
}

// Combine is Split's inverse: one state for the panel out of the two files.
func Combine(workspace, global map[string]any) map[string]any {
	out := map[string]any{}
	for key, value := range global {
		out[key] = value
	}
	for key, value := range workspace {
		out[key] = value
	}
	if _, ok := out["version"]; !ok {
		out["version"] = float64(1)
	}
	if _, ok := out["sessions"]; !ok {
		out["sessions"] = []any{}
	}
	return out
}

// MergeWorkspace folds an incoming panel state into whatever is already on disk.
//
// Two windows can be open on the same workspace, each holding a full copy of the state
// from when it started. A plain overwrite would drop every session the other window
// created since. So sessions are unioned by id, with the newer `updatedAt` winning for
// any id both sides know, and deletions are carried as tombstones — without them a
// stale window would resurrect a session the user just deleted in the other one.
//
// Everything outside `sessions` is last-write-wins: those are single-valued choices the
// user has just made in *this* window, so the most recent write is the right answer.
func MergeWorkspace(base, incoming map[string]any) map[string]any {
	if base == nil {
		base = map[string]any{}
	}
	out := map[string]any{}
	for key, value := range incoming {
		out[key] = value
	}

	graves := mergeTombstones(base["deletedSessions"], incoming["deletedSessions"])

	out["sessions"] = mergeSessions(sessionList(base["sessions"]), sessionList(incoming["sessions"]), graves)
	if pruned := pruneTombstones(graves); len(pruned) > 0 {
		out["deletedSessions"] = pruned
	} else {
		delete(out, "deletedSessions")
	}
	return out
}

// MergeGlobal folds preferences into the shared file. Scalars are last-write-wins, which
// is right for a preference the user just set; provider-keyed maps merge per key.
func MergeGlobal(base, incoming map[string]any) map[string]any {
	if base == nil {
		base = map[string]any{}
	}
	out := map[string]any{}
	for key, value := range base {
		out[key] = value
	}
	for key, value := range incoming {
		if mergeableMaps[key] {
			out[key] = mergeStringMap(base[key], value)
			continue
		}
		out[key] = value
	}
	return out
}

func mergeStringMap(base, incoming any) any {
	baseMap, _ := base.(map[string]any)
	incomingMap, ok := incoming.(map[string]any)
	if !ok {
		return incoming
	}
	out := map[string]any{}
	for key, value := range baseMap {
		out[key] = value
	}
	for key, value := range incomingMap {
		out[key] = value
	}
	return out
}

func sessionList(raw any) []map[string]any {
	items, ok := raw.([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if session, ok := item.(map[string]any); ok {
			out = append(out, session)
		}
	}
	return out
}

func mergeTombstones(base, incoming any) map[string]time.Time {
	out := map[string]time.Time{}
	for _, raw := range []any{base, incoming} {
		entries, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		for id, value := range entries {
			at, ok := parseTime(value)
			if !ok {
				continue
			}
			if previous, seen := out[id]; !seen || at.After(previous) {
				out[id] = at
			}
		}
	}
	return out
}

// pruneTombstones drops graves old enough that no window can still be holding a stale
// copy of the session they bury.
func pruneTombstones(graves map[string]time.Time) map[string]any {
	cutoff := time.Now().Add(-tombstoneTTL)
	out := map[string]any{}
	for id, at := range graves {
		if at.Before(cutoff) {
			continue
		}
		out[id] = at.UTC().Format(time.RFC3339Nano)
	}
	return out
}

func mergeSessions(base, incoming []map[string]any, graves map[string]time.Time) []any {
	seen := map[string]bool{}
	var out []any

	keep := func(session map[string]any) {
		id := str(session["id"])
		if id == "" || seen[id] {
			return
		}
		seen[id] = true
		if buried(session, graves[id]) {
			return
		}
		out = append(out, session)
	}

	// The window doing the writing goes first: its ordering is the freshest view.
	for _, session := range incoming {
		winner := session
		if other := findSession(base, str(session["id"])); other != nil && newer(other, session) {
			winner = other
		}
		keep(winner)
	}
	// Then anything only the other window knows about.
	for _, session := range base {
		keep(session)
	}
	if out == nil {
		return []any{}
	}
	return out
}

func findSession(sessions []map[string]any, id string) map[string]any {
	if id == "" {
		return nil
	}
	for _, session := range sessions {
		if str(session["id"]) == id {
			return session
		}
	}
	return nil
}

// buried reports whether a tombstone outranks this copy of the session. A session with
// no usable timestamp loses: the tombstone is an explicit user action, the session's age
// is a guess.
func buried(session map[string]any, deletedAt time.Time) bool {
	if deletedAt.IsZero() {
		return false
	}
	at, ok := parseTime(session["updatedAt"])
	if !ok {
		return true
	}
	return !at.After(deletedAt)
}

func newer(a, b map[string]any) bool {
	left, okLeft := parseTime(a["updatedAt"])
	right, okRight := parseTime(b["updatedAt"])
	if !okLeft {
		return false
	}
	if !okRight {
		return true
	}
	return left.After(right)
}

func parseTime(value any) (time.Time, bool) {
	text, ok := value.(string)
	if !ok || text == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
		if at, err := time.Parse(layout, text); err == nil {
			return at, true
		}
	}
	return time.Time{}, false
}

// HasHistory reports whether a state carries anything worth keeping.
func HasHistory(state map[string]any) bool {
	if state == nil {
		return false
	}
	for _, session := range sessionList(state["sessions"]) {
		if str(session["acpSessionId"]) != "" {
			return true
		}
		if providers, ok := session["acpByProvider"].(map[string]any); ok && len(providers) > 0 {
			return true
		}
		if messages, ok := session["messages"].([]any); ok && len(messages) > 0 {
			return true
		}
	}
	return false
}

// Load reassembles the state for this window: the current workspace's bucket plus the
// shared preferences. A window with no folder open is filed under the home directory.
func Load() (map[string]any, bool) {
	global, hasGlobal := readMap(paths.GlobalStatePath())
	workspace, hasWorkspace := map[string]any(nil), false
	if path := paths.WorkspaceUIStatePath(); path != "" {
		if _, err := os.Stat(path); err == nil {
			if unlock, lockErr := lockBucket(filepath.Dir(path)); lockErr == nil {
				defer unlock()
			}
		}
		loaded, _, err := loadSplit(path)
		if err != nil {
			// Splitting failed before the original was touched. Keep serving the
			// inline file so this window still has its history.
			loaded, _ = readMap(path)
		}
		workspace, hasWorkspace = loaded, loaded != nil
	}
	if !hasGlobal && !hasWorkspace {
		return nil, false
	}
	return Combine(workspace, global), true
}

// Save mirrors the panel's state back to disk, splitting it and merging each half with
// whatever another window may have written in the meantime.
//
// Sessions are skipped only when there is still no workspace path. That happens when
// the home directory itself cannot be resolved; a window with no folder open uses home.
func Save(state map[string]any) error {
	if state == nil {
		return nil
	}
	workspace, global := Split(state)

	if err := saveMerged(paths.GlobalStatePath(), global, MergeGlobal); err != nil {
		return err
	}

	target := paths.WorkspaceUIStatePath()
	if target == "" {
		return nil
	}
	if err := writeWorkspaceMeta(); err != nil {
		return err
	}
	return saveWorkspace(target, workspace)
}

func saveMerged(path string, incoming map[string]any, merge func(base, incoming map[string]any) map[string]any) error {
	base, _ := readMap(path)
	raw, err := json.MarshalIndent(merge(base, incoming), "", "  ")
	if err != nil {
		return err
	}
	return writeAtomic(path, append(raw, '\n'))
}

// writeWorkspaceMeta leaves a human-readable note in the bucket saying which workspace
// the hashed directory name stands for.
func writeWorkspaceMeta() error {
	path := paths.WorkspaceMetaPath()
	if path == "" {
		return nil
	}
	if _, err := os.Stat(path); err == nil {
		return nil
	}
	raw, err := json.MarshalIndent(map[string]any{
		"path":      paths.WorkspaceKey(),
		"name":      paths.WorkspaceName(),
		"createdAt": time.Now().UTC().Format(time.RFC3339),
	}, "", "  ")
	if err != nil {
		return err
	}
	return writeAtomic(path, append(raw, '\n'))
}

func readMap(path string) (map[string]any, bool) {
	if path == "" {
		return nil, false
	}
	raw, err := os.ReadFile(path)
	if err != nil || len(raw) == 0 {
		return nil, false
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, false
	}
	return out, true
}

// writeAtomic writes through a temp file in the *same* directory and renames it over the
// target. Same directory matters: rename is only atomic within one filesystem.
func writeAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	temp, err := os.CreateTemp(dir, ".tmp-"+filepath.Base(path)+"-*")
	if err != nil {
		return err
	}
	name := temp.Name()
	defer os.Remove(name) // no-op once the rename below succeeds

	if _, err := temp.Write(data); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Chmod(0o644); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Sync(); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	return os.Rename(name, path)
}

func str(v any) string {
	s, _ := v.(string)
	return s
}
