# Requirements

## Running-turn messaging

- An unread steering message remains a normal user message and must not show a new-turn thinking placeholder beneath it.
- Queue “Send now” steers plain text when the active agent supports steering. Otherwise, it interrupts the active turn and sends the selected queue item immediately.
- Remaining queued messages keep their relative order. If the Host rejects an immediate prompt as busy, restore that item at the front of the queue.
