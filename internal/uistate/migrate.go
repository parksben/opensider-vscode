package uistate

import (
	"fmt"
	"os"
	"time"

	"opensidervscode/internal/log"
	"opensidervscode/internal/paths"
)

// Migrate moves the single pre-split ~/.opensider-vscode/ui-state.json into the bucket
// for the workspace this window has open, exactly once.
//
// The data in that file is the user's real chat history and there is no second copy of
// it, so the order of operations is chosen to be safe under both a crash and a race
// against another window starting at the same moment:
//
//  1. Copy the legacy file to a dated backup. Nothing destructive has happened yet.
//  2. Rename the legacy file to `.migrating`. Rename is atomic, so of N hosts racing,
//     exactly one wins; the losers see no legacy file and skip. This is the claim, and
//     because it is a rename rather than a lock there is nothing to release if the
//     winner is then killed.
//  3. Merge the claimed content into this workspace's bucket and into the global
//     preferences. Both go through the same atomic write as every other save.
//  4. Rename `.migrating` to a dated `.migrated-…`, which retires the claim.
//
// If the host dies between 2 and 4 the content is still sitting in `.migrating`, so the
// next start picks it up again and re-runs the merge, which is idempotent. Because the
// legacy file is consumed by step 2 and never restored, the history lands in exactly one
// workspace no matter how many the user opens afterwards.
func Migrate() {
	if paths.WorkspaceUIStatePath() == "" {
		// No folder open: there is no bucket to migrate into. Leave the legacy file
		// untouched and try again when a window with a workspace starts.
		return
	}

	claim := paths.LegacyClaimPath()
	if _, err := os.Stat(claim); err != nil {
		legacy := paths.LegacyUIStatePath()
		info, err := os.Stat(legacy)
		if err != nil || info.IsDir() || info.Size() == 0 {
			return
		}
		if err := backup(legacy); err != nil {
			log.Log("ui-state migration: backup failed, not touching the original: " + err.Error())
			return
		}
		if err := os.Rename(legacy, claim); err != nil {
			// Lost the race to another host, or the file vanished. Either way it is
			// not ours to migrate.
			return
		}
	}

	state, ok := readMap(claim)
	if !ok {
		log.Log("ui-state migration: claimed file is not valid json, leaving it in place")
		return
	}

	workspace, global := Split(state)
	if err := saveMerged(paths.GlobalStatePath(), global, MergeGlobal); err != nil {
		log.Log("ui-state migration: global write failed: " + err.Error())
		return
	}
	if err := writeWorkspaceMeta(); err != nil {
		log.Log("ui-state migration: workspace meta write failed: " + err.Error())
		return
	}
	if err := saveMerged(paths.WorkspaceUIStatePath(), workspace, MergeWorkspace); err != nil {
		log.Log("ui-state migration: workspace write failed: " + err.Error())
		return
	}

	retired := fmt.Sprintf("%s.migrated-%s", paths.LegacyUIStatePath(), time.Now().Format("20060102-150405"))
	if err := os.Rename(claim, retired); err != nil {
		// The data is safely in the bucket; a stuck claim only costs one redundant
		// idempotent merge on the next start.
		log.Log("ui-state migration: could not retire the claim: " + err.Error())
	}
	log.Log(fmt.Sprintf("ui-state migrated into %s (%d sessions)", paths.WorkspaceStateDir(), len(sessionList(workspace["sessions"]))))
}

func backup(legacy string) error {
	raw, err := os.ReadFile(legacy)
	if err != nil {
		return err
	}
	target := fmt.Sprintf("%s.backup-%s", legacy, time.Now().Format("20060102-150405"))
	return writeAtomic(target, raw)
}
