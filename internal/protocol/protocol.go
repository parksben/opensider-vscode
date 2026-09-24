// Package protocol 是宿主与 VS Code 扩展之间的线上类型。
//
// 它只描述「聊天 + Agent」这一套：Agent 探测结果、模型、权限档、连接进度。
// 浏览器那套（页面工具、标签快照、截图、产物上报）在 VS Code 里没有对应物，
// 所以不在这里。
package protocol

// HostName 只用于日志与诊断：VS Code 直接以子进程方式启动宿主，
// 不走 Chrome 的 Native Messaging 注册。
const HostName = "com.opensider.vscode.host"

type AttachmentKind string

const (
	KindImage  AttachmentKind = "image"
	KindFile   AttachmentKind = "file"
	KindFolder AttachmentKind = "folder"
)

type AttachmentItem struct {
	Path string         `json:"path"`
	Name string         `json:"name"`
	Kind AttachmentKind `json:"kind"`
}

type AgentModel struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type AgentPolicy string

const (
	PolicyAsk        AgentPolicy = "ask"
	PolicyWorkspace  AgentPolicy = "workspace"
	PolicyAuto       AgentPolicy = "auto"
	PolicyUnattended AgentPolicy = "unattended"
)

type AgentMark string

type AgentCaps struct {
	Models    bool `json:"models"`
	Questions bool `json:"questions"`
	Plans     bool `json:"plans"`
	Todos     bool `json:"todos"`
}

type AgentInfo struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Mark      AgentMark `json:"mark"`
	Command   string    `json:"command,omitempty"`
	Installed bool      `json:"installed"`
	Hint      string    `json:"hint,omitempty"`
	Caps      AgentCaps `json:"caps"`
}

type AgentProgress struct {
	Phase string `json:"phase"`
	Index int    `json:"index"`
	Total int    `json:"total"`
	Label string `json:"label"`
}
