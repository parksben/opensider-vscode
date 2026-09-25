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

func TestCurrentFileBlockIsEmptyWithoutAFile(t *testing.T) {
	if got := formatCurrentFile(nil, nil); got != "" {
		t.Fatalf("expected no block, got %q", got)
	}
	if got := formatCurrentFile(map[string]any{"languageId": "go"}, nil); got != "" {
		t.Fatalf("a report with no path must produce no block, got %q", got)
	}
}
