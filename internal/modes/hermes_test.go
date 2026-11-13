package modes

import (
	"encoding/json"
	"testing"

	"opensidervscode/internal/protocol"
	"opensidervscode/internal/sessioncfg"
)

// hermes-agent 0.23.1 实测：configOptions 的 edit_approval_policy 优先，同时还有
// 旧 modes（两套 id 不同：config 是 ask/workspace_session/session，modes 是
// default/accept_edits/dont_ask）。
const hermesSession = `{
  "sessionId": "local-2da03bbb",
  "modes": {"currentModeId": "default", "availableModes": [
    {"id": "default", "name": "Default", "description": "Ask before edits."},
    {"id": "accept_edits", "name": "Accept Edits", "description": "Auto-allow workspace and temp-dir edits; still asks for sensitive paths."},
    {"id": "dont_ask", "name": "Don't Ask", "description": "Auto-allow file edits for this session except sensitive paths."}
  ]},
  "configOptions": [
    {"id": "edit_approval_policy", "category": "mode", "currentValue": "ask", "options": [
      {"value": "ask", "name": "Default"},
      {"value": "workspace_session", "name": "Accept Edits"},
      {"value": "session", "name": "Don't Ask"}
    ]},
    {"id": "model", "category": "model", "currentValue": "deepseek:deepseek-flash", "options": [
      {"value": "deepseek:deepseek-flash", "name": "DeepSeek · deepseek-flash"}
    ]},
    {"id": "reasoning_effort", "category": "thought_level", "currentValue": "default", "options": [
      {"value": "default", "name": "Default"}, {"value": "high", "name": "High"}
    ]}
  ]
}`

func hermesFixture(t *testing.T) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal([]byte(hermesSession), &out); err != nil {
		t.Fatalf("bad fixture: %v", err)
	}
	return out
}

func TestHermesPrefersEditApprovalConfig(t *testing.T) {
	session := hermesFixture(t)
	target, ok := Discover("hermes", sessioncfg.Parse(session["configOptions"]), session["modes"])
	if !ok {
		t.Fatal("hermes advertises three edit approval levels, expected a target")
	}
	if target.Source != SourceConfig || target.ConfigID != "edit_approval_policy" {
		t.Fatalf("want config source with configId=edit_approval_policy, got %+v", target)
	}
	if target.Current != "ask" {
		t.Fatalf("want current ask, got %q", target.Current)
	}
	want := map[string]Kind{"ask": KindAsk, "workspace_session": KindEdits, "session": KindFullAccess}
	if len(target.Options) != len(want) {
		t.Fatalf("unexpected options %+v", target.Options)
	}
	for _, option := range target.Options {
		if want[option.ID] != option.Kind {
			t.Fatalf("%q classified as %q, want %q", option.ID, option.Kind, want[option.ID])
		}
	}
}

func TestHermesPolicyCandidatesFollowApprovalLevels(t *testing.T) {
	session := hermesFixture(t)
	options := sessioncfg.Parse(session["configOptions"])
	target, has := Discover("hermes", options, session["modes"])
	for _, item := range []struct {
		policy protocol.AgentPolicy
		want   string
	}{
		{protocol.PolicyAsk, "ask"},
		{protocol.PolicyWorkspace, "workspace_session"},
		{protocol.PolicyAuto, "session"},
		{protocol.PolicyUnattended, "session"},
	} {
		push := Plan(item.policy, "hermes", target, has, options, "")
		if push.ModeID != item.want {
			t.Fatalf("policy %q: want mode %q, got %+v", item.policy, item.want, push)
		}
		if push.ConfigID != "" {
			t.Fatalf("policy %q should not push a separate config option: %+v", item.policy, push)
		}
	}
}

func TestHermesFallsBackToLegacyModes(t *testing.T) {
	session := hermesFixture(t)
	target, ok := Discover("hermes", nil, session["modes"])
	if !ok {
		t.Fatal("hermes legacy modes should still be switchable")
	}
	if target.Source != SourceModes || target.Current != "default" {
		t.Fatalf("want legacy modes with current=default, got %+v", target)
	}
	for _, item := range []struct {
		policy protocol.AgentPolicy
		want   string
	}{
		{protocol.PolicyAsk, "default"},
		{protocol.PolicyWorkspace, "accept_edits"},
		{protocol.PolicyUnattended, "dont_ask"},
	} {
		push := Plan(item.policy, "hermes", target, true, nil, "")
		if push.ModeID != item.want {
			t.Fatalf("policy %q: want legacy mode %q, got %+v", item.policy, item.want, push)
		}
	}
}
