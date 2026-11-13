package detect

import (
	"strings"
	"testing"
)

// Hermes 自带 ACP server：规范入口是 `hermes acp`，老安装没有子命令时退到
// 独立启动器 `hermes-acp`。
func TestHermesProfileLaunchesACP(t *testing.T) {
	p := ProfileByID("hermes")
	if p == nil {
		t.Fatal("missing hermes profile")
	}
	if len(p.Launches) != 2 {
		t.Fatalf("launches %+v", p.Launches)
	}
	if p.Launches[0].Command != "hermes-acp" {
		t.Fatalf("first launch %+v, want hermes-acp", p.Launches[0])
	}
	if p.Launches[1].Command != "hermes" || len(p.Launches[1].Args) != 1 || p.Launches[1].Args[0] != "acp" {
		t.Fatalf("fallback launch %+v, want hermes acp", p.Launches[1])
	}
	if !p.Caps.Plans || !p.Caps.Todos || p.Caps.Questions {
		t.Fatalf("caps %+v, want plans/todos on and questions off", p.Caps)
	}
	if !strings.Contains(p.LoginHint, "hermes setup") {
		t.Fatalf("login hint %q", p.LoginHint)
	}
}
