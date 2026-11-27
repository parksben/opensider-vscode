# Requirements

## Running-turn messaging

- An unread steering message remains a normal user message and must not show a new-turn thinking placeholder beneath it.
- Queue “Send now” steers plain text when the active agent supports steering. Otherwise, it interrupts the active turn and sends the selected queue item immediately.
- Remaining queued messages keep their relative order. If the Host rejects an immediate prompt as busy, restore that item at the front of the queue.

## Workspace cache performance

- Full transcripts must not be synchronously serialized into webview localStorage on settings changes or repeated hide events.
- Keep the cache scoped to each workspace, preserve existing scoped history during migration, and keep Host mirror recovery available if caching fails.
- Streaming must not starve queue/settings persistence or reorder steering and lifecycle events.

## Running-turn performance

- While a turn is running, typing, switching sessions, and interacting with the page must remain responsive.
- Streamed ACP updates are coalesced into an animation-frame batch before rebuilding React message state.
- The UI must not write or mirror transcript bodies on every stream frame. It may persist settings immediately and transcript state at turn end or panel shutdown.
