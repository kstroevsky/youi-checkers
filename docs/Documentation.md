# White Maybe Black - Technical Documentation

## 1. Purpose and scope
This project is a local hot-seat implementation of White Maybe Black:
- one browser and one shared screen
- no backend/network in v1
- deterministic engine that can later be reused for online play, AI, replay, and saved sessions

The architecture follows a strict split:
- **Domain layer** (`src/domain/*`): pure game rules and immutable state transitions
- **Application layer** (`src/app/store/*`): UI interaction state machine, persistence, and command orchestration
- **UI layer** (`src/ui/*` + `src/app/App.tsx`): rendering and input capture only

## 2. Core domain model
Primary domain types live in `src/domain/model/types.ts`.

Main entities:
- `Player`: `'white' | 'black'`
- `Checker`: owner + frozen status
- `Cell`: checker array (bottom -> top)
- `Board`: `Record<Coord, Cell>`
- `TurnAction`: legal action union (`jumpSequence`, `climbOne`, `moveSingleToEmpty`, `split...`, `manualUnfreeze`, etc.)
- `GameState`: board + turn owner + move number + status + victory + history + position counters
- `RuleConfig`: toggleable rules (friendly transfer, draw rule, scoring mode)

Board/coord helpers:
- `src/domain/model/coordinates.ts`
- `src/domain/model/board.ts`

## 3. Deterministic engine entry points
The engine API is exported via `src/domain/index.ts`.

Key functions:
- `createInitialState`
- `getLegalActions`, `getLegalActionsForCell`, `getLegalTargetsForCell`
- `validateAction`
- `applyActionToBoard`
- `applyAction` (authoritative reducer transition)
- `checkVictory`
- `serializeSession`, `deserializeSession`

All rules are pure and React-independent.

## 4. Move generation and validation flow
Implemented in `src/domain/rules/moveGeneration.ts`.

### 4.1 Legal action generation
`getLegalActionsForCell(state, coord, config)`:
1. Rejects if game is over.
2. Allows `manualUnfreeze` if selected checker is frozen and owned by current player.
3. Verifies that selected piece is either:
   - active single checker owned by player, or
   - player-controlled stack.
4. Adds all jump sequences via recursive search.
5. Adds `climbOne` targets.
6. Adds `moveSingleToEmpty` targets for active single checkers and controlled stacks (adjacent empty cells only; stack moves as one unit).
7. For stacks, adds:
   - `splitOneFromStack`
   - `splitTwoFromStack`
   - `friendlyStackTransfer` (if toggle enabled)

### 4.2 Jump resolution model
Jumping is simulated segment-by-segment:
- `applySingleJumpSegment` validates geometry and occupancy.
- Landings must be empty.
- Middle cell must be a legal jump-over cell (never a stack).
- If jumping over enemy single checker, it becomes frozen.
- If jumping over own frozen single checker, it gets unfrozen.
- Opponents cannot jump over a frozen checker they do not own.

To prevent illegal loops in chain jumps, the engine tracks `visited` jump states using:
- current coordinate + board hash (`createJumpStateKey`).

### 4.3 Validation strategy
`validateAction` combines:
- common source ownership checks
- action-specific legality checks
- structural legality check via legal-action regeneration for target-based actions

## 5. Authoritative reducer transition
Implemented in `src/domain/reducers/gameReducer.ts` (`applyAction`).

Transition pipeline:
1. Resolve effective config (`withRuleDefaults`).
2. Validate action (`validateAction`).
3. Apply action to board (`applyActionToBoard`).
4. Switch turn to opponent.
5. Evaluate immediate victory.
6. Apply forced auto-pass logic if next player has no legal actions.
7. If both players have no legal actions, produce `stalemateDraw`.
8. Update position repetition counter (`positionCounts`) with position hash.
9. Re-check victory (including threefold draw when enabled).
10. Append full turn record to history (`beforeState`, `afterState`, action, autoPasses).

This function is the only legal way to mutate `GameState` in normal gameplay.

## 6. Victory and scoring logic
Victory rules: `src/domain/rules/victory.ts`
- `homeField`: all 18 player checkers are singles on that player's home rows
- `sixStacks`: six controlled height-3 stacks on front home row
- `threefoldDraw`: same position (including side to move) reached >= 3 times (toggle-controlled)

Optional score summary: `src/domain/rules/scoring.ts`
- informational only
- does not affect legality or terminal state

## 7. Interaction state machine (application layer)
Implemented in `src/app/store/createGameStore.ts`.

Runtime interaction states (`InteractionState`):
- `idle`
- `pieceSelected`
- `jumpFollowUp`
- `choosingTarget`
- `buildingJumpChain`
- `turnResolved`
- `passingDevice`
- `gameOver`

Main flow:
1. User selects a cell (`selectCell`).
2. Store queries legal actions from domain engine.
3. User chooses action type (`chooseActionType`).
4. Store highlights legal targets.
5. For jumps, each legal target click immediately commits one jump segment.
6. If that jump leaves a legal continuation, store resets to a neutral `jumpFollowUp` state for the same player.
7. The follow-up state keeps all legal sources selectable, while `buildingJumpChain` is still used only inside an in-progress jump selection before commit.
8. Store resolves turn/pass only when the player switches to a non-jump move, the latest jump has no continuation, or a jump wins immediately.

## 8. Undo/redo and history model
Store keeps:
- `turnLog`: one shared action/history timeline
- `past`: lightweight undo frames (`snapshot + positionCounts + historyCursor`)
- `gameState`: current position
- `future`: lightweight redo frames
- `historyCursor`: current index in timeline

Behavior:
- `undo`: pop one frame from `past`, push current frame to `future`
- `redo`: shift one frame from `future`, push current frame to `past`
- any new committed action clears `future`

Runtime `gameState.history` is reconstructed from `turnLog.slice(0, historyCursor)`, so history is stored once but still exposed to the domain engine in its expected shape.

## 9. Persistence and import/export
Session serialization lives in `src/domain/serialization/session.ts`.

`SerializableSession` contains:
- `version: 2`
- `ruleConfig`
- `preferences`
- `turnLog`
- `present`: current undo frame
- `past`: undo frames
- `future`: redo frames

Compatibility:
- v2 is the write format
- v1 payloads are still accepted and migrated on load/import

Safety model:
- strict runtime guards (`assert*` functions) validate every nested value
- game-state invariants are re-checked via `validateGameState`
- invalid storage payloads are discarded

Storage integration in `createGameStore`:
- key: `SESSION_STORAGE_KEY`
- automatic persistence after state-changing actions using compact JSON
- export JSON is regenerated only on explicit refresh
- import buffer remains local UI state until import is requested

## 10. UI composition and responsibilities
- `src/app/App.tsx`: top-level composition and tab navigation
- `src/ui/board/Board.tsx`: memoized board grid and coordinate layout
- `src/ui/cells/BoardCell.tsx`: per-cell interaction and highlighting
- `src/ui/panels/ControlPanel.tsx`: independently subscribed status/actions/settings/history/import-export sections
- `src/ui/pieces/CheckerStack.tsx`: memoized visual stack layers and frozen marker

UI never re-implements game legality; it always delegates to domain selectors/functions.

## 11. Rule toggle system
Rule defaults and toggle descriptors:
- `src/domain/model/ruleConfig.ts`

Toggles currently supported:
- non-adjacent friendly stack transfer
- threefold repetition draw
- basic score mode

Toggles are applied centrally and propagated to all domain calls through store state.

## 12. Extension points for v2+
Current design is prepared for future features:
- online multiplayer: deterministic action/state protocol already serializable
- AI opponent: can evaluate `getLegalActions` and use `applyAction` directly
- move replay: structured history with snapshots and actions
- saved games: session serializer already available
- optional rule variants: centralized `RuleConfig`

## 13. Test strategy currently in repository
Domain tests are in `src/domain/rules/gameEngine.test.ts` and app tests in `src/app/App.test.tsx`.

Priority coverage focuses on:
- action legality and board invariants
- jump freezing/unfreezing behavior
- victory detection
- reducer-driven turn transitions
- UI interaction wiring for core flows
