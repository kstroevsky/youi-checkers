# White Maybe Black v1 Technical Spec

## Core entities
- Board: 6x6 grid keyed as `A1` through `F6`
- Checker: `owner`, `frozen`, `id`
- Cell: `checkers[]` ordered from bottom to top
- Stack: any cell with 2 or 3 checkers; controller is the top checker owner
- Game state: board, current player, move number, status, victory, history, repetition counts
- Turn action: `jumpSequence`, `manualUnfreeze`, `climbOne`, `moveSingleToEmpty`, `splitOneFromStack`, `splitTwoFromStack`, `friendlyStackTransfer`

## Enforced invariants
- Every cell height stays within `0..3`
- Frozen checkers exist only as single checkers
- Stacks never contain frozen checkers
- Stack controller always matches the top checker owner
- Jumps only land on empty cells
- Jumps never cross stacks
- No move may place a checker onto a frozen single

## Canonical rule defaults
- `allowNonAdjacentFriendlyStackTransfer: true`
- `drawRule: 'threefold'`
- `scoringMode: 'basic'`
- `passDeviceOverlay: true`

## Optional rule semantics
- Non-adjacent friendly transfer moves exactly one top checker from one controlled stack to any other controlled stack on the board, regardless of path blocking, provided the target height remains at most 3.
- Basic score mode is informational only. It reports home-field singles, controlled stacks, controlled home-row height-3 stacks, and frozen enemy singles.

## Core move clarification
- Active single checkers and controlled stacks may move one step to an adjacent empty cell in any of 8 directions.
- Step-moved stacks move as a full unit.
- Frozen singles may not move.
- Frozen singles may be jumped over only by their owner; that jump unfreezes them.

## Victory and draw
- `homeField`: all 18 of a player's checkers are active singles on that player's home rows
- `sixStacks`: the player controls six height-3 stacks on the six front home-row cells
- `threefoldDraw`: the same full position hash, including side to move, appears for the third time
- `stalemateDraw`: after turn resolution, neither player has a legal action and no win condition is met

## Jump follow-up behavior
- Jump actions are single-segment (`source -> one landing`) and are applied immediately.
- If another jump segment is legal from the new landing, the same player keeps the turn.
- On that continued turn, the player may continue the jump with the same unit or use any other legal move.
- If the chosen move is another jump that also leaves a continuation, the same player keeps the turn again.
- Turn handoff occurs when the player chooses a non-jump move or when the latest jump has no continuation, unless a jump already ended the game.
