# Precise game instruction - English

## White Maybe Black - Canonical Rulebook

## 1. Overview

**White Maybe Black** is a two-player abstract board game played on a **6x6** board.

Each player starts with **18 checkers**:

* **White** starts on rows **1-3**
* **Black** starts on rows **4-6**

The board is completely filled at the start:

* 36 occupied cells
* no empty cells
* no starting stacks

**White moves first.**

The game revolves around:

* jumping over single checkers,
* freezing and unfreezing checkers,
* creating and controlling stacks,
* transferring your pieces to your own half of the board.

---

## 2. Board and coordinates

The board has:

* columns **A-F** from left to right
* rows **1-6** from bottom to top

So:

* **A1** is the bottom-left cell
* **F6** is the top-right cell

---

## 3. Home fields

Each player starts on the opponent's side and tries to reach their own home field.

* **White home field**: rows **4-6**
* **Black home field**: rows **1-3**

The “first six cells” of the home field are:

* for **White**: **A6, B6, C6, D6, E6, F6**
* for **Black**: **A1, B1, C1, D1, E1, F1**

---

## 4. Entities

## 4.1 Checker

A checker belongs to either White or Black.

A checker may be:

* **active**
* **frozen**

A frozen checker is still owned by the same player. Freezing does **not** change color or ownership.

---

## 4.2 Single checker

A **single checker** is one checker standing alone on a cell.

Only **single checkers** may be jumped over.

A single checker may be:

* active
* frozen

---

## 4.3 Stack

A **stack** is a pile of **2 or 3 checkers** on one cell.

Rules for stacks:

* maximum height is **3**
* a stack may contain both colors
* the stack is controlled by the player whose checker is on **top**
* if the top checker is White, the stack is White-controlled
* if the top checker is Black, the stack is Black-controlled

Important:

* a checker inside a stack is never treated as frozen
* frozen checkers do **not** exist inside stacks
* you cannot jump over a stack

---

## 4.4 Empty cell

An empty cell contains no checkers.

At the start of the game there are no empty cells.
Empty cells appear later as stacks are formed and split.

---

## 5. Objective

A player wins immediately by achieving **one** of the following conditions.

### 5.1 Home-field win

All of that player's checkers are:

* on that player's home field
* and are **not** part of any stack

So for this win condition, all of your 18 checkers must stand as single checkers on your home side.

### 5.2 Six-stack win

The player controls **6 stacks of height 3** on the six first cells of their home field.

That means:

* White wins this way if White controls height-3 stacks on **A6-F6**
* Black wins this way if Black controls height-3 stacks on **A1-F1**

For this win condition, a stack counts as yours if **your checker is on top**.

---

## 6. Turn structure

A turn belongs to the current player.

On a turn, the player performs **one action**.

If a player has no legal action, that player **passes automatically**, and the opponent continues taking turns until the blocked player has a legal action again.

---

## 7. Directions

Movement is allowed in all **8 directions**:

* up
* down
* left
* right
* the 4 diagonals

---

## 8. Core jump rule

A jump is the main movement mechanic.

A jump segment is legal only if:

1. the moving unit is an **active single checker** or a **controlled stack**
2. the adjacent cell in the chosen direction contains a **single checker**
3. the cell immediately behind that checker, in the same direction, is **empty**

Therefore:

* you jump **over one single checker**
* you land on the **empty cell immediately behind it**
* you may **not** jump over a stack
* you may **not** land on an occupied cell during a jump

This means jumps **never create stacks directly**.

Active units also have a basic step move:

* an active single checker or a controlled stack may move exactly one cell to an **adjacent empty cell**
* this step move works in all 8 directions
* a stack step moves the full stack as one unit
* frozen checkers still cannot move

---

## 9. Jumping over your own checker

You may jump over **your own active single checker**.

Effects:

* the jumped checker is **not frozen**
* the move simply increases distance
* the landing cell must be empty

This is one of the main ways to advance and apply freezing effects, while one-cell empty-step movement is a separate move type.

---

## 10. Jumping over an opponent checker

You may jump over an **opponent's active single checker**.

Effects:

* the landing cell must be empty
* the jumped opponent checker is **flipped**
* a flipped checker becomes **frozen**

Freezing changes only the checker's state, not its owner.

---

## 11. Jumping over a frozen checker

A frozen checker may be jumped over **only by its owner**, and only for the purpose of unfreezing it.

That means:

* White may jump over a White frozen checker
* Black may jump over a Black frozen checker
* the landing cell must still be empty
* after that jump, the frozen checker becomes active again

An opponent may **not** jump over your frozen checker.

---

## 12. Multi-jump flow

Jumps are executed **one segment at a time**.

After each legal jump segment:

* the board updates immediately
* if another legal jump segment exists from the new position, the same player keeps the turn
* on that continued turn, the player may either continue jumping with the same checker or stack, or use any other legal move
* if the chosen move is another jump that also leaves a continuation, the same player keeps the turn again
* the turn passes only after the player chooses a non-jump move or the latest jump has no continuation

For every segment:

* the jumped piece must be a **single checker**
* the landing cell must be **empty**
* freezing/unfreezing is applied separately for the jumped checker

If several opponent singles are jumped across consecutive segments or across several continued jump turns, each jumped opponent single becomes frozen separately.

---

## 13. Frozen checker rules

A frozen checker:

* cannot move
* cannot be part of a stack
* cannot be climbed onto
* cannot be used as the landing cell of another move
* cannot be jumped over by the opponent
* may be jumped over only by its owner to unfreeze it

So a frozen checker is a blocked single checker.

---

## 14. Unfreezing without jumping

Instead of moving, a player may spend the whole turn to **manually unfreeze one of their own frozen checkers**.

That checker becomes active again.

This is a full action for the turn.

---

## 15. Creating stacks

Stacks are not created by jumping.

Stacks are created by **climbing** onto an occupied active cell.

A climb is a non-jump move where **one active checker** moves onto an **adjacent occupied active cell**.

The moving checker becomes the new top checker.

A climb is legal only if:

* the target cell is adjacent
* the target cell contains an **active** single checker or an **active** stack
* the target cell does **not** contain a frozen checker
* the resulting height does not exceed **3**

So:

* single -> single creates a 2-stack
* single -> stack may create a 3-stack
* top checker from a stack -> adjacent occupied active cell may also create or change a stack

Only **one checker at a time** may climb onto another occupied cell.

---

## 16. Controlled stack movement

A stack controlled by you may move as one unit under the **same jump rules** as a single checker.

That means:

* a stack may jump over a **single checker**
* the landing cell must be **empty**
* a stack may not jump over another stack
* if a stack jumps over an opponent's active single checker, that checker becomes frozen
* if a stack jumps over one of your frozen single checkers, that checker becomes active again

The full stack moves together.

---

## 17. Splitting a stack - one-checker move

From a stack you control, you may move **the top checker only**.

That top checker may move to an **adjacent** cell:

* to an empty cell, becoming a single checker
* or to an occupied active cell, creating or changing a stack

This move is legal only if:

* the source stack is controlled by you
* the moved checker is the top checker
* the destination is adjacent
* the destination is not a frozen checker
* the resulting destination height is at most 3

This rule allows:

* building a new adjacent stack
* strengthening your adjacent stack
* placing your checker on top of an adjacent opponent stack and taking control of it

An adjacent enemy stack may be captured this way because control depends on the top checker.

---

## 18. Splitting a stack - two-checker move

From a stack you control, you may move the **top two checkers together** as a mini-stack.

This is legal only if:

* there is an **adjacent empty cell**
* the source stack has at least two checkers
* the two moved checkers remain together
* they move onto that adjacent empty cell only

A two-checker split may **not** land on an occupied cell.

So:

* two-checker split is only for moving onto a neighboring empty cell
* it creates a height-2 stack on the destination cell

---

## 19. Special stack-to-stack transfer

There is a special move from one of your stacks to another.

A player may move **exactly one top checker** from one controlled stack to another controlled stack.

Based on your clarified rules, this special transfer:

* works with stacks generally
* moves only **one checker**
* must respect the maximum stack height of **3**

The part that is fully clear from your clarifications is this:

* moving one top checker from your stack onto an **adjacent** occupied active cell is definitely legal
* moving one top checker from your stack onto an **adjacent enemy stack** is legal and may capture it
* earlier clarifications also indicated a special friendly stack-to-stack move that is **not necessarily adjacent**

Because that non-adjacent friendly transfer was described earlier but not redefined in the final wording, the safest precise interpretation is:

**Canonical practical rule for implementation**

* adjacent top-checker transfer to an occupied active cell is always legal
* non-adjacent transfer between two of your own stacks should be treated as an optional advanced rule unless you decide to lock it formally

This is the only place where the stack rules are still slightly less rigid than the rest.

---

## 20. What is not allowed

The following are illegal:

* jumping over a stack
* landing on an occupied cell during a jump
* climbing onto a frozen checker
* placing any checker onto a frozen checker
* creating a stack higher than 3
* moving a checker that is not on top of its stack
* moving a frozen checker
* jumping over an opponent's frozen checker

---

## 21. Draws and scoring

At this stage, the core rules of the game are clear enough to play, but **draw rules** and a fully standardized **point-scoring system** are not yet finalized.

So the canonical core rulebook is:

* **official core play**: movement, stacks, freezing, victory
* **not yet standardized**: draw handling and points

Recommended optional draw rule for practical play:

* draw by **threefold repetition** of the same full game position

Recommended optional score mode:

* keep it as a separate variant, not part of the core engine
