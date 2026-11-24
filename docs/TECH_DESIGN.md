# Technical design

## Running-turn messaging

- Determine the thinking placeholder from the last settled user message, but suppress it while that message has `awaitingSteer`.
- Keep native steering for eligible plain-text queue items. For other immediate sends, pass `interrupt: true` to the Host prompt; the Host owns cancellation and replacement ordering.
- Keep the session marked running across the interrupted turn so the replacement prompt can start without flushing the rest of the queue. Set the replacement turn's start time after the interrupted turn settles.
- Preserve the immediate prompt's bind metadata until it is accepted or rejected. On `prompt.busy`, remove its transcript bubble and return it to the queue head; if the interrupted turn has already ended, finish that superseded state and resume queue flushing.

## Streaming performance

- Each host ACP stream frame is not a React state boundary. `App` accumulates `update` payloads per local session and applies them once in the next animation frame.
- Usage updates remain separate and are not converted into transcript messages.
- Transcript persistence stays suppressed while a turn is running; only settings changes persist immediately. A `turn.end` or panel shutdown writes the final transcript once.
