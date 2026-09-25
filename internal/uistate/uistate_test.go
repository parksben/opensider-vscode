package uistate

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"opensidervscode/internal/paths"
)

func session(id, updatedAt string, messages int) map[string]any {
	list := make([]any, messages)
	for i := range list {
		list[i] = map[string]any{"role": "user"}
	}
	return map[string]any{"id": id, "updatedAt": updatedAt, "messages": list}
}

func ids(raw any) []string {
	var out []string
	for _, item := range sessionList(raw) {
		out = append(out, str(item["id"]))
	}
	return out
}

func TestBucketNameIsStableAndReadable(t *testing.T) {
	alpha := paths.BucketName("/Users/me/projects/alpha", "alpha")
	if alpha != paths.BucketName("/Users/me/projects/alpha", "alpha") {
		t.Fatal("bucket name is not deterministic")
	}
	if alpha == paths.BucketName("/Users/me/projects/beta", "beta") {
		t.Fatal("two workspaces share a bucket")
	}
	if !strings.HasPrefix(alpha, "alpha-") {
		t.Fatalf("bucket name is not human-readable: %q", alpha)
	}
	if paths.BucketName("/Users/me/projects/alpha/", "alpha") != alpha {
		t.Fatal("a trailing separator changes the bucket")
	}
	if paths.BucketName("", "") != "" {
		t.Fatal("a folder-less window must not get a bucket")
	}
	// A project named only in CJK has no safe short form; the hash still separates it.
	cjk := paths.BucketName("/Users/me/项目", "项目")
	if !strings.HasPrefix(cjk, "workspace-") {
		t.Fatalf("non-ascii name should fall back to a plain slug: %q", cjk)
	}
	if cjk == paths.BucketName("/Users/me/其他", "其他") {
		t.Fatal("two non-ascii workspaces collided")
	}
}

func TestSplitPutsSessionsInTheWorkspaceAndPrefsInGlobal(t *testing.T) {
	workspace, global := Split(map[string]any{
		"version":            float64(1),
		"sessions":           []any{session("a", "2026-01-01T00:00:00Z", 1)},
		"selectedId":         "a",
		"agentMode":          "unattended",
		"theme":              "dark",
		"locale":             "zh",
		"selectedProviderId": "cursor",
	})
	for _, key := range []string{"sessions", "selectedId", "agentMode"} {
		if _, ok := workspace[key]; !ok {
			t.Fatalf("%s must be per-workspace", key)
		}
		if _, ok := global[key]; ok {
			t.Fatalf("%s leaked into the global file", key)
		}
	}
	for _, key := range []string{"theme", "locale", "selectedProviderId"} {
		if _, ok := global[key]; !ok {
			t.Fatalf("%s must be global", key)
		}
		if _, ok := workspace[key]; ok {
			t.Fatalf("%s leaked into the workspace bucket", key)
		}
	}
	if global["version"] == nil {
		t.Fatal("the global half needs its own envelope to be readable alone")
	}
}

func TestMergeWorkspaceKeepsBothWindowsSessions(t *testing.T) {
	onDisk := map[string]any{"sessions": []any{session("shared", "2026-01-01T00:00:00Z", 1), session("fromB", "2026-01-02T00:00:00Z", 2)}}
	fromA := map[string]any{"sessions": []any{session("shared", "2026-01-01T00:00:00Z", 1), session("fromA", "2026-01-03T00:00:00Z", 3)}}

	got := ids(MergeWorkspace(onDisk, fromA)["sessions"])
	want := map[string]bool{"shared": true, "fromA": true, "fromB": true}
	if len(got) != 3 {
		t.Fatalf("expected all three sessions, got %v", got)
	}
	for _, id := range got {
		if !want[id] {
			t.Fatalf("unexpected session %q in %v", id, got)
		}
	}
}

func TestMergeWorkspacePrefersTheNewerCopy(t *testing.T) {
	onDisk := map[string]any{"sessions": []any{session("s", "2026-01-05T00:00:00Z", 9)}}
	stale := map[string]any{"sessions": []any{session("s", "2026-01-01T00:00:00Z", 1)}}

	merged := sessionList(MergeWorkspace(onDisk, stale)["sessions"])
	if len(merged) != 1 {
		t.Fatalf("expected one session, got %d", len(merged))
	}
	if got := len(merged[0]["messages"].([]any)); got != 9 {
		t.Fatalf("a stale window overwrote a newer session: %d messages", got)
	}
}

func TestMergeWorkspaceHonoursTombstones(t *testing.T) {
	// Window B still holds the session A just deleted. Without the tombstone B's next
	// save would resurrect it.
	stale := map[string]any{"sessions": []any{session("doomed", "2026-01-01T00:00:00Z", 1)}}
	afterDelete := map[string]any{
		"sessions":        []any{},
		"deletedSessions": map[string]any{"doomed": "2026-01-02T00:00:00Z"},
	}

	merged := MergeWorkspace(stale, afterDelete)
	if got := ids(merged["sessions"]); len(got) != 0 {
		t.Fatalf("deleted session came back: %v", got)
	}

	// But a session edited *after* the delete is a new intent and must survive.
	revived := map[string]any{"sessions": []any{session("doomed", "2026-01-03T00:00:00Z", 4)}}
	if got := ids(MergeWorkspace(merged, revived)["sessions"]); len(got) != 1 {
		t.Fatalf("a session newer than its tombstone was wrongly buried: %v", got)
	}
}

func TestMergeGlobalMergesProviderMapsPerKey(t *testing.T) {
	onDisk := map[string]any{"theme": "dark", "selectedModelByProvider": map[string]any{"claude": "opus"}}
	incoming := map[string]any{"theme": "light", "selectedModelByProvider": map[string]any{"cursor": "auto"}}

	merged := MergeGlobal(onDisk, incoming)
	if merged["theme"] != "light" {
		t.Fatal("a scalar preference should be last-write-wins")
	}
	models := merged["selectedModelByProvider"].(map[string]any)
	if models["claude"] != "opus" || models["cursor"] != "auto" {
		t.Fatalf("provider map lost an entry: %v", models)
	}
}

// scratchHome points every paths.* helper at a temp directory. The real
// ~/.opensider-vscode must never be touched by a test.
func scratchHome(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Cleanup(func() { paths.SetWorkspace("", "", "") })
	return home
}

func TestMigrationLandsInExactlyOneBucket(t *testing.T) {
	home := scratchHome(t)
	sidebar := filepath.Join(home, ".opensider-vscode")
	if err := os.MkdirAll(sidebar, 0o755); err != nil {
		t.Fatal(err)
	}
	legacy := filepath.Join(sidebar, "ui-state.json")
	original := map[string]any{
		"version":  float64(1),
		"theme":    "dark",
		"locale":   "zh",
		"sessions": []any{session("real", "2026-01-01T00:00:00Z", 2)},
	}
	raw, _ := json.Marshal(original)
	if err := os.WriteFile(legacy, raw, 0o644); err != nil {
		t.Fatal(err)
	}

	// First window: workspace "alpha" opens and claims the legacy state.
	paths.SetWorkspace(filepath.Join(home, "alpha"), filepath.Join(home, "alpha"), "alpha")
	Migrate()

	alphaState, ok := Load()
	if !ok {
		t.Fatal("alpha cannot read the migrated state")
	}
	if got := ids(alphaState["sessions"]); len(got) != 1 || got[0] != "real" {
		t.Fatalf("the session did not land in alpha: %v", got)
	}
	if alphaState["theme"] != "dark" || alphaState["locale"] != "zh" {
		t.Fatal("global preferences were lost in the migration")
	}

	// Second window: a different workspace must NOT inherit the history.
	paths.SetWorkspace(filepath.Join(home, "beta"), filepath.Join(home, "beta"), "beta")
	Migrate()
	betaState, _ := Load()
	if got := ids(betaState["sessions"]); len(got) != 0 {
		t.Fatalf("history was duplicated into beta: %v", got)
	}
	if betaState["theme"] != "dark" {
		t.Fatal("beta should still share the global theme")
	}

	// The original file is backed up and consumed, never simply deleted.
	entries, _ := os.ReadDir(sidebar)
	var backup, migrated bool
	for _, entry := range entries {
		if strings.Contains(entry.Name(), "ui-state.json.backup-") {
			backup = true
		}
		if strings.Contains(entry.Name(), "ui-state.json.migrated-") {
			migrated = true
		}
	}
	if !backup {
		t.Fatal("the irreplaceable original was not backed up")
	}
	if !migrated {
		t.Fatal("the legacy file was not retired")
	}
	if _, err := os.Stat(legacy); err == nil {
		t.Fatal("the legacy file is still in place and would migrate again")
	}
}

func TestMigrationWaitsForAWorkspace(t *testing.T) {
	home := scratchHome(t)
	sidebar := filepath.Join(home, ".opensider-vscode")
	_ = os.MkdirAll(sidebar, 0o755)
	legacy := filepath.Join(sidebar, "ui-state.json")
	_ = os.WriteFile(legacy, []byte(`{"version":1,"sessions":[{"id":"real","updatedAt":"2026-01-01T00:00:00Z","messages":[{}]}]}`), 0o644)

	paths.SetWorkspace("", "", "")
	Migrate()

	if _, err := os.Stat(legacy); err != nil {
		t.Fatal("a folder-less window consumed the legacy file with nowhere to put it")
	}
}

func TestFolderlessWindowSavesPrefsButNoSessions(t *testing.T) {
	scratchHome(t)
	paths.SetWorkspace("", "", "")

	if err := Save(map[string]any{
		"version":  float64(1),
		"theme":    "light",
		"sessions": []any{session("ephemeral", "2026-01-01T00:00:00Z", 1)},
	}); err != nil {
		t.Fatal(err)
	}
	state, ok := Load()
	if !ok {
		t.Fatal("preferences should still persist without a folder")
	}
	if state["theme"] != "light" {
		t.Fatal("preference was not saved")
	}
	if got := ids(state["sessions"]); len(got) != 0 {
		t.Fatalf("a folder-less window persisted chat history: %v", got)
	}
}

func TestConcurrentSavesToTheSameWorkspaceLoseNothing(t *testing.T) {
	home := scratchHome(t)
	paths.SetWorkspace(filepath.Join(home, "shared"), filepath.Join(home, "shared"), "shared")

	const windows = 8
	const rounds = 10
	var wg sync.WaitGroup
	for w := 0; w < windows; w++ {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			for r := 0; r < rounds; r++ {
				id := "w" + string(rune('A'+w))
				_ = Save(map[string]any{
					"version":  float64(1),
					"sessions": []any{session(id, time.Now().UTC().Format(time.RFC3339Nano), r+1)},
				})
			}
		}(w)
	}
	wg.Wait()

	state, ok := Load()
	if !ok {
		t.Fatal("state file is unreadable after concurrent writes")
	}
	got := ids(state["sessions"])
	if len(got) != windows {
		t.Fatalf("expected %d sessions after concurrent writes, got %d: %v", windows, len(got), got)
	}
}
