# Game Logic Engine

`src/domain/` contains the pure TypeScript rules engine for White Maybe Black.
It has no React dependencies and is written so the same state transition logic can be reused by the UI, tests, persistence, or a future server/AI layer.

## Public Entry Points

- `createInitialState()` and `createInitialBoard()` in [`generators/createInitialState.ts`](./generators/createInitialState.ts)
- `getLegalActions()`, `getLegalActionsForCell()`, `validateAction()`, and board-target helpers in [`rules/moveGeneration.ts`](./rules/moveGeneration.ts)
- `applyAction()` in [`reducers/gameReducer.ts`](./reducers/gameReducer.ts)
- `checkVictory()` in [`rules/victory.ts`](./rules/victory.ts)
- `getScoreSummary()` in [`rules/scoring.ts`](./rules/scoring.ts)
- session serialization helpers in [`serialization/session.ts`](./serialization/session.ts)

The barrel file [`index.ts`](./index.ts) re-exports the stable domain API consumed by the app layer.

## Module Layout

- `model/`
  - board primitives, coordinates, constants, hashing, rule-config defaults, and core types
- `rules/`
  - legal move generation, validation, scoring, and victory checks
- `reducers/`
  - the authoritative immutable state transition entry point (`applyAction`)
- `generators/`
  - initial board/state creation
- `serialization/`
  - import/export and shared-turn-log persistence
- `validators/`
  - board and state invariant checks used by move application

## State Transition Pipeline

One legal move always flows through the same pipeline:

1. `validateAction(state, action, config)`
2. `applyValidatedActionToBoard(state, action)` in the move-generation layer
3. reducer post-processing in `applyAction()`:
   - switch turn or keep it for a forced jump continuation
   - detect direct victory
   - detect forced pass / stalemate
   - increment repetition counts
   - re-check terminal conditions on the final turn owner
   - append a structured `TurnRecord`

This keeps the engine deterministic and makes UI behavior a projection of engine state instead of a source of rule logic.

## Board Representation

- Each cell stores `checkers` bottom -> top.
- Stack control always belongs to the top checker.
- Structural sharing is used where possible:
  - `cloneBoardStructure()` copies only the board record
  - `ensureMutableCell()` deep-clones cells lazily on first write
- Full deep clones are limited to snapshots/serialization boundaries, not every move path.

## Invariants

These are enforced by validation helpers and engine tests:

- cell height is `0..3`
- stacks may not contain frozen checkers
- a frozen checker can only exist as a single checker
- jump landings must be empty
- jumps cannot pass over stacks
- occupied landing rules differ by action type and are validated centrally
- both players always retain exactly 18 checkers in valid runtime states

## Victory Rules

- `homeField`: all 18 of a player's checkers are singles inside that player's three home rows
- `sixStacks`: all six front-row cells contain height-3 stacks made entirely of that player's checkers
- `threefoldDraw`: only when enabled in config and the current hashed position occurred at least three times
- `stalemateDraw`: neither player has any legal actions after forced-pass evaluation

The six-stack rule is intentionally stricter than stack control alone: a mixed-color stack does not qualify, even if the top checker matches the candidate winner.

## Performance / Readability Notes

- Move generation remains the single source of truth for legality, so the reducer does not duplicate rule branches.
- Hashing is used only where it buys something meaningful:
  - jump-loop prevention on board states
  - threefold repetition detection
- Small board helper functions in `model/board.ts` are preferred over duplicating raw `checkers` array logic across rule files.
- Engine tests in [`rules/gameEngine.test.ts`](./rules/gameEngine.test.ts) are the canonical behavior contract for the reducer and victory rules.
