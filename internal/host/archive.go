package host

import (
	"encoding/json"

	"opensidervscode/internal/log"
	"opensidervscode/internal/uistate"
)

// restoreSessionBody sends an archived session's body back to the panel. The body
// lives in sessions/<id>.json; the active index only carries metadata, so the
// panel asks for it when the user restores a conversation. Host→extension frames
// still go through the 1MB native cap, hence the same chunking as ui.state.
func (h *Host) restoreSessionBody(requestID, id string) {
	if requestID == "" || id == "" {
		return
	}
	body, ok := uistate.ReadSessionBody(id)
	if !ok {
		h.send(map[string]any{
			"type":      "session.restore",
			"requestId": requestID,
			"error":     "archive not found",
		})
		log.Log("session restore missing " + id)
		return
	}
	raw, err := json.Marshal(body)
	if err != nil {
		h.send(map[string]any{
			"type":      "session.restore",
			"requestId": requestID,
			"error":     "archive is unreadable",
		})
		log.Log("session restore marshal: " + err.Error())
		return
	}
	chunks := splitStateText(string(raw))
	for index, data := range chunks {
		h.send(map[string]any{
			"type":      "session.restore",
			"requestId": requestID,
			"index":     index,
			"total":     len(chunks),
			"data":      data,
		})
	}
	log.Log("session restore " + id)
}

// runningACPIDs lists the ACP sessions the host is currently prompting. The panel
// usually knows too, but it can be reopened while a background turn is still going.
func (h *Host) runningACPIDs() map[string]bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := map[string]bool{}
	for _, runtime := range h.runtimes {
		if runtime == nil || runtime.client == nil || !runtime.prompting {
			continue
		}
		if id := runtime.client.GetSessionID(); id != "" {
			out[id] = true
		}
	}
	return out
}

// archiveSessions moves a batch of sessions' bodies out of the active index. The
// panel asks for this only after it has persisted the bodies to the host, but the
// host still re-checks each body file before dropping it: a session that was never
// mirrored (fresh host data, a failed save) is skipped and stays active.
func (h *Host) archiveSessions(requestID string, ids []string) {
	if requestID == "" || len(ids) == 0 {
		return
	}
	archivedAt, archived, skipped, err := uistate.ArchiveSessions(ids, h.runningACPIDs())
	reply := map[string]any{
		"type":      "session.archived",
		"requestId": requestID,
		"ids":       archived,
	}
	if archivedAt != "" {
		reply["archivedAt"] = archivedAt
	}
	if len(skipped) > 0 {
		reply["skipped"] = skipped
	}
	if err != nil {
		reply["error"] = err.Error()
		log.Log("session archive: " + err.Error())
	}
	log.Log("session archive request handled")
	h.send(reply)
}

func archiveIDList(v any) []string {
	items, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		if text, ok := item.(string); ok && text != "" {
			out = append(out, text)
		}
	}
	return out
}
