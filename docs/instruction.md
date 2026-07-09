# Precise game instruction - English

## YOUI - Canonical Rulebook

## 1. Overview

**YOUI** is a two-player abstract board game played on a **6x6** board.

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

A frozen checker may be jumped over by **either player**.

That means:

* White may jump over a White frozen checker
* White may jump over a Black frozen checker
* Black may jump over a Black frozen checker
* Black may jump over a White frozen checker
* the landing cell must still be empty
* after that jump, the frozen checker becomes active again

---

## 12. Multi-jump flow

Jumps are executed **one segment at a time**.

After each legal jump segment:

* the board updates immediately
* if another legal jump segment exists from the new position, the same player keeps the turn
* on that continued turn, the player may either continue jumping with the same checker or stack, or use any other legal action with that same checker or stack
* if the chosen move is another jump that also leaves a continuation, the same player keeps the turn again
* the turn passes only after the player chooses a non-jump move or the latest jump has no continuation

For every segment:

* the jumped piece must be a **single checker**
* the landing cell must be **empty**
* freezing/unfreezing is applied separately for the jumped checker

If several opponent singles are jumped across consecutive segments or across several continued jump turns, each jumped opponent single becomes frozen separately.

A jump chain is also **color-consistent**: the first segment fixes which color of checker may be jumped for the rest of that chain. If the first jump crossed a White checker, every later segment in the same chain must also cross a White checker. If it crossed a Black checker, every later segment must also cross a Black checker.

---

## 13. Frozen checker rules

A frozen checker:

* cannot move
* cannot be part of a stack
* cannot be climbed onto
* cannot be used as the landing cell of another move
* may be jumped over by either player
* becomes active again after that jump

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
* if a stack jumps over a frozen single checker, that checker becomes active again

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

That mini-stack may move to an **adjacent** cell:

* to an empty cell, remaining a 2-stack
* or to an occupied active cell, creating or changing a stack

This is legal only if:

* the source stack is controlled by you
* the source stack has at least two checkers
* the two moved checkers remain together
* the destination is adjacent
* the destination is not a frozen checker
* the resulting destination height is at most 3

So:

* a two-checker split may still move onto a neighboring empty cell
* it may also land on an occupied active single checker and form a height-3 stack
* it may **not** land on an occupied height-2 stack, because that would exceed height 3

---

## 19. Special stack-to-stack transfer

There is a special friendly transfer between stacks. This rule is enabled by default, but it can be disabled in the match settings.

A player may transfer **exactly one of their checkers** to another stack they control. The source and destination do **not** need to be adjacent.

The source may be:

* a stack controlled by the player, in which case its top checker is transferred
* a stack controlled by the opponent that has at least one of the player's checkers buried beneath the opponent's top checker

When transferring from under an opponent's checker, only the player's highest buried checker is removed. The opponent's top checker and every lower checker remain in their original order.

The destination must:

* already be a stack controlled by the player
* contain no frozen checker
* remain at height **3** or less after the transfer

---

## 20. What is not allowed

The following are illegal:

* jumping over a stack
* landing on an occupied cell during a jump
* climbing onto a frozen checker
* placing any checker onto a frozen checker
* creating a stack higher than 3
* moving a checker that is not on top of its stack, except for the one-checker friendly transfer from beneath an opponent's top checker
* moving a frozen checker

---

## 21. Draws and scoring

Draw outcomes are resolved with a deterministic tiebreak.

Draw triggers:

* **threefold repetition** of the same full position with the same side to move (if the threefold rule is enabled)
* **stalemate/pat** when both players have no legal action after auto-pass handling

Resolution order for both draw triggers:

1. Compare how many **own checkers are on own home field**:
   * white counts white checkers on rows 4-6
   * black counts black checkers on rows 1-3
   * all own checkers count, including own checkers inside mixed/blocked stacks
2. If equal, compare how many **completed own home stacks** each player has:
   * completed stack = height 3 stack containing only that player's checkers
   * count only stacks on that player's own home field
3. If still equal, the result stays a draw.

Score mode remains optional and informational.
