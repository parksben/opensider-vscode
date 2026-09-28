package host

import "testing"

func file(overrides map[string]any) map[string]any {
	base := map[string]any{
		"relativePath": "src/sidepanel/App.tsx",
		"languageId":   "typescriptreact",
		"line":         float64(128),
		"column":       float64(3),
		"dirty":        false,
		"lineCount":    float64(1770),
	}
	for key, value := range overrides {
		base[key] = value
	}
	return base
}

func TestCurrentFileBlockShowsTheCaret(t *testing.T) {
	got := formatCurrentFile(file(nil), nil)
	want := "[Current file] src/sidepanel/App.tsx — typescriptreact, line 128\n\n"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestCurrentFileBlockShowsASelectionAndDirtyState(t *testing.T) {
	got := formatCurrentFile(file(map[string]any{
		"dirty":     true,
		"selection": map[string]any{"startLine": float64(120), "endLine": float64(145)},
	}), nil)
	want := "[Current file] src/sidepanel/App.tsx — typescriptreact, lines 120-145 selected, unsaved\n\n"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestCurrentFileBlockIsDroppedWhenTheRangeIsAlreadyAttached(t *testing.T) {
	selection := map[string]any{"startLine": float64(120), "endLine": float64(145)}
	attachments := []any{map[string]any{
		"relativePath": "src/sidepanel/App.tsx",
		"startLine":    float64(120),
		"endLine":      float64(145),
	}}
	if got := formatCurrentFile(file(map[string]any{"selection": selection}), attachments); got != "" {
		t.Fatalf("duplicated an explicit attachment: %q", got)
	}

	// A different range of the same file still carries information.
	other := []any{map[string]any{
		"relativePath": "src/sidepanel/App.tsx",
		"startLine":    float64(10),
		"endLine":      float64(20),
	}}
	if got := formatCurrentFile(file(map[string]any{"selection": selection}), other); got == "" {
		t.Fatal("dropped the block for a range that was not attached")
	}
}

func TestCurrentWindowBlockNamesTheWindow(t *testing.T) {
	got := formatCurrentWindow(map[string]any{
		"id":        float64(2),
		"sessionId": "sess-1",
		"appName":   "Cursor",
		"uriScheme": "cursor",
		"focused":   false,
	})
	want := "[Current window] Cursor (cursor), id 2, session sess-1, unfocused — this chat is bound to window id 2. Open Playwright, browser tabs, and other editor features in this window, not another one. OPENSIDER_VSCODE_WINDOW_ID is set on the agent process.\n\n"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestCurrentWindowBlockWithoutAnId(t *testing.T) {
	got := formatCurrentWindow(map[string]any{
		"sessionId": "sess-1",
		"appName":   "Visual Studio Code",
		"uriScheme": "vscode",
		"focused":   true,
	})
	want := "[Current window] Visual Studio Code (vscode), session sess-1, focused — this chat is bound to this window. Open Playwright, browser tabs, and other editor features in this window, not another one.\n\n"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestCurrentWindowBlockIsEmptyWithoutIdentity(t *testing.T) {
	if got := formatCurrentWindow(nil); got != "" {
		t.Fatalf("expected no block, got %q", got)
	}
	if got := formatCurrentWindow(map[string]any{"focused": true}); got != "" {
		t.Fatalf("focus alone must produce no block, got %q", got)
	}
}

func TestWindowProcessEnvCarriesTheId(t *testing.T) {
	env := mergeWindowEnv(map[string]string{"PATH": "/bin"}, editorWindow{
		ID:        2,
		SessionID: "sess-1",
		AppName:   "Cursor",
		URIScheme: "cursor",
	})
	if env["OPENSIDER_VSCODE_WINDOW_ID"] != "2" || env["OPENSIDER_VSCODE_SESSION_ID"] != "sess-1" || env["PATH"] != "/bin" {
		t.Fatalf("env = %#v", env)
	}
	if env["OPENSIDER_VSCODE_URI_SCHEME"] != "cursor" || env["OPENSIDER_VSCODE_APP_NAME"] != "Cursor" {
		t.Fatalf("env = %#v", env)
	}
	// An unknown window must not invent an id, and must not copy the profile env.
	base := map[string]string{"PATH": "/bin"}
	if got := mergeWindowEnv(base, editorWindow{}); got["PATH"] != "/bin" || len(got) != 1 {
		t.Fatalf("empty window should keep the base env, got %#v", got)
	}
}

func TestCurrentFileBlockIsEmptyWithoutAFile(t *testing.T) {
	if got := formatCurrentFile(nil, nil); got != "" {
		t.Fatalf("expected no block, got %q", got)
	}
	if got := formatCurrentFile(map[string]any{"languageId": "go"}, nil); got != "" {
		t.Fatalf("a report with no path must produce no block, got %q", got)
	}
}
