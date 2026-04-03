/**
 * Before/after performance benchmark for the numeric action ID refactor.
 *
 * Measures the specific inner-loop operations that changed:
 *   OLD: actionKey() string concat → Map<string, number> lookups + string-keyed policyPriors
 *   NEW: encodeActionIndex() O(1) lookup → Map<number, number> lookups + Float32Array policyPriors
 *
 * Run with: npx vitest run src/ai/test/perf.benchmark.test.ts --reporter=verbose
 */

import { describe, it } from 'vitest';

import { AI_DIFFICULTY_PRESETS, chooseComputerAction } from '@/ai';
import { AI_MODEL_ACTION_COUNT, encodeActionIndex } from '@/ai/model/actionSpace';
import { actionKey } from '@/ai/search/shared';
import { getLegalActions, createInitialState, applyAction } from '@/domain';
import { withConfig } from '@/test/factories';
import { createSeededRandom } from '@/ai/test/searchTestUtils';
import type { TurnAction } from '@/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bench(label: string, iterations: number, fn: () => void): void {
  // Warm-up
  for (let i = 0; i < Math.min(1000, iterations / 10); i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;

  const opsPerMs = iterations / elapsed;
  console.log(
    `  ${label.padEnd(52)} ${String(Math.round(opsPerMs * 1000)).padStart(10)} ops/s  (${elapsed.toFixed(1)} ms / ${iterations} iters)`,
  );
}

function buildActions(): TurnAction[] {
  const config = withConfig({ drawRule: 'threefold' });
  const s1 = applyAction(createInitialState(config), { type: 'climbOne', source: 'A1', target: 'B2' }, config);
  const s2 = applyAction(s1, { type: 'climbOne', source: 'F6', target: 'E5' }, config);
  const s3 = applyAction(s2, { type: 'climbOne', source: 'B2', target: 'C3' }, config);
  return getLegalActions(s3, config); // ~20-30 actions
}

// ---------------------------------------------------------------------------
// Benchmark suite
// ---------------------------------------------------------------------------

describe('numeric-action-id refactor: before vs after', () => {
  const actions = buildActions();
  const ITERS = 200_000;

  console.log(`\n  Actions in test position: ${actions.length}`);
  console.log('');

  // --- 1. Key generation ---------------------------------------------------

  it('1. key generation: actionKey (string) vs encodeActionIndex (numeric)', () => {
    console.log('\n  [1] Key generation per action:');

    bench('OLD  actionKey(action) → string', ITERS, () => {
      for (const action of actions) actionKey(action);
    });

    bench('NEW  encodeActionIndex(action) → number', ITERS, () => {
      for (const action of actions) encodeActionIndex(action);
    });
  }, 30_000);

  // --- 2. History score lookup ----------------------------------------------

  it('2. historyScores lookup: Map<string> vs Map<number>', () => {
    console.log('\n  [2] History score lookup per batch of actions:');

    const stringKeys = actions.map(actionKey);
    const numericIds = actions.map((a) => encodeActionIndex(a) ?? -1);

    // Prefill maps with realistic sizes (~500 entries = mid-search state)
    const stringMap = new Map<string, number>();
    const numericMap = new Map<number, number>();
    for (let i = 0; i < 500; i++) {
      stringMap.set(`climbOne:${String.fromCharCode(65 + (i % 6))}${(i % 6) + 1}:${String.fromCharCode(65 + ((i + 1) % 6))}${((i + 1) % 6) + 1}`, i * 24);
      numericMap.set(i * 5, i * 24);
    }
    // Also add the actual action keys
    for (let i = 0; i < stringKeys.length; i++) {
      stringMap.set(stringKeys[i]!, (i + 1) * 400);
      numericMap.set(numericIds[i]!, (i + 1) * 400);
    }

    bench('OLD  map.get(stringKey)', ITERS, () => {
      for (const key of stringKeys) stringMap.get(key);
    });

    bench('NEW  map.get(numericId)', ITERS, () => {
      for (const id of numericIds) numericMap.get(id);
    });
  });

  // --- 3. Continuation score lookup ----------------------------------------

  it('3. continuationScores: string concat key vs integer pair key', () => {
    console.log('\n  [3] Continuation score lookup per batch (with prev action):');

    const prevKey = actionKey(actions[0]!);
    const prevId = encodeActionIndex(actions[0]!) ?? -1;
    const stringKeys = actions.map(actionKey);
    const numericIds = actions.map((a) => encodeActionIndex(a) ?? -1);

    const stringMap = new Map<string, number>();
    const numericMap = new Map<number, number>();
    for (let i = 0; i < stringKeys.length; i++) {
      stringMap.set(`${prevKey}->${stringKeys[i]}`, (i + 1) * 250);
      numericMap.set(prevId * AI_MODEL_ACTION_COUNT + numericIds[i]!, (i + 1) * 250);
    }

    bench('OLD  map.get(`${prevKey}->${key}`)  [string alloc]', ITERS, () => {
      for (const key of stringKeys) stringMap.get(`${prevKey}->${key}`);
    });

    bench('NEW  map.get(prevId * 2736 + id)    [no alloc]', ITERS, () => {
      for (const id of numericIds) numericMap.get(prevId * AI_MODEL_ACTION_COUNT + id);
    });
  });

  // --- 4. Policy priors lookup ----------------------------------------------

  it('4. policyPriors: Record<string, number> vs Float32Array', () => {
    console.log('\n  [4] Policy prior lookup per batch of actions:');

    const stringKeys = actions.map(actionKey);
    const numericIds = actions.map((a) => encodeActionIndex(a) ?? -1);

    const recordPriors: Record<string, number> = {};
    const arrayPriors = new Float32Array(AI_MODEL_ACTION_COUNT);
    for (let i = 0; i < stringKeys.length; i++) {
      recordPriors[stringKeys[i]!] = (i + 1) / stringKeys.length;
      arrayPriors[numericIds[i]!] = (i + 1) / numericIds.length;
    }

    bench('OLD  record[stringKey]', ITERS, () => {
      for (const key of stringKeys) recordPriors[key];
    });

    bench('NEW  float32Array[numericId]', ITERS, () => {
      for (const id of numericIds) arrayPriors[id];
    });
  });

  // --- 5. Killer move check ------------------------------------------------

  it('5. killer check: TurnAction[] isSameAction vs number[] includes', () => {
    console.log('\n  [5] Killer move match check per batch of actions:');

    const killerActions = actions.slice(0, 2);
    const killerIds = killerActions.map((a) => encodeActionIndex(a) ?? -1);
    const numericIds = actions.map((a) => encodeActionIndex(a) ?? -1);

    bench('OLD  killers.some(k => actionKey(k) === actionKey(a))', ITERS, () => {
      for (const action of actions) {
        killerActions.some((k) => actionKey(k) === actionKey(action));
      }
    });

    bench('NEW  killerIds.includes(id)', ITERS, () => {
      for (const id of numericIds) {
        killerIds.includes(id);
      }
    });
  }, 30_000);

  // --- 6. Combined inner-loop simulation -----------------------------------

  it('6. combined inner-loop: full precompute scoring pass (string vs numeric)', () => {
    console.log('\n  [6] Full scoring pass simulation (one ordering call):');

    const stringKeys = actions.map(actionKey);
    const numericIds = actions.map((a) => encodeActionIndex(a) ?? -1);
    const prevStringKey = stringKeys[0]!;
    const prevNumericId = numericIds[0]!;

    // String world
    const histStr = new Map<string, number>(stringKeys.map((k, i) => [k, (i + 1) * 400]));
    const contStr = new Map<string, number>(
      stringKeys.map((k, i) => [`${prevStringKey}->${k}`, (i + 1) * 250]),
    );
    const polStr: Record<string, number> = Object.fromEntries(
      stringKeys.map((k, i) => [k, (i + 1) / stringKeys.length]),
    );

    // Numeric world
    const histNum = new Map<number, number>(numericIds.map((id, i) => [id, (i + 1) * 400]));
    const contNum = new Map<number, number>(
      numericIds.map((id, i) => [prevNumericId * AI_MODEL_ACTION_COUNT + id, (i + 1) * 250]),
    );
    const polNum = new Float32Array(AI_MODEL_ACTION_COUNT);
    numericIds.forEach((id, i) => { polNum[id] = (i + 1) / numericIds.length; });

    bench('OLD  per-action: get history + get continuation + get policyPrior', ITERS, () => {
      for (let i = 0; i < stringKeys.length; i++) {
        const k = stringKeys[i]!;
        histStr.get(k);
        contStr.get(`${prevStringKey}->${k}`);
        polStr[k];
      }
    });

    bench('NEW  per-action: get history + get continuation + get policyPrior', ITERS, () => {
      for (let i = 0; i < numericIds.length; i++) {
        const id = numericIds[i]!;
        histNum.get(id);
        contNum.get(prevNumericId * AI_MODEL_ACTION_COUNT + id);
        polNum[id];
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Micro-optimisation suite: zero-logic-risk changes
// ---------------------------------------------------------------------------

describe('zero-logic-risk micro-opts: before vs after', () => {
  const ITERS = 500_000;

  console.log('\n  [micro-opts benchmark]');

  // --- A. Quiet-move filter: two-pass vs single-pass -------------------------

  it('A. quiet-move filter: two filter() calls vs single for-loop pass', () => {
    console.log('\n  [A] finalizeOrderedActions trimming (100 moves, quietMoveLimit=20):');

    const MOVE_COUNT = 100;
    const QUIET_LIMIT = 20;

    // Simulate an ordered list: first 10 tactical, rest quiet (already sorted)
    const ordered = Array.from({ length: MOVE_COUNT }, (_, i) => ({
      isTactical: i < 10,
      score: MOVE_COUNT - i,
    }));

    bench('OLD  filter(tactical) + filter(quiet).slice(limit)', ITERS, () => {
      const tacticalMoves = ordered.filter((e) => e.isTactical);
      const quietMoves = ordered.filter((e) => !e.isTactical).slice(0, QUIET_LIMIT);
      void [...tacticalMoves, ...quietMoves];
    });

    bench('NEW  single for-loop, early stop on quiet limit', ITERS, () => {
      const tacticalMoves: typeof ordered = [];
      const quietMoves: typeof ordered = [];
      for (const entry of ordered) {
        if (entry.isTactical) {
          tacticalMoves.push(entry);
        } else if (quietMoves.length < QUIET_LIMIT) {
          quietMoves.push(entry);
        }
      }
      void [...tacticalMoves, ...quietMoves];
    });
  }, 30_000);

  // --- B. Root PV move: Map.get/set vs plain variable -----------------------

  it('B. root PV move: Map<number,number>.get/set(0) vs plain let variable', () => {
    console.log('\n  [B] Root PV move read+write per depth iteration:');

    const pvMap = new Map<number, number>();
    let pvVar: number | null = null;
    const actionIdValue = 1337;

    bench('OLD  pvMoveByDepth.get(0) + pvMoveByDepth.set(0, id)', ITERS, () => {
      void (pvMap.get(0) ?? null);
      pvMap.set(0, actionIdValue);
    });

    bench('NEW  rootPvMoveId (plain let)', ITERS, () => {
      void pvVar;
      pvVar = actionIdValue;
    });
  });

  // --- C. Timeout error: new Error() vs pre-allocated singleton -------------

  it('C. timeout error: new Error(msg) vs pre-allocated singleton', () => {
    console.log('\n  [C] Error object allocation (not throw — just construction cost):');

    const SENTINEL = 'AI_SEARCH_TIMEOUT';
    const PREALLOC = new Error(SENTINEL);

    bench('OLD  new Error(AI_SEARCH_TIMEOUT) on every timeout', ITERS, () => {
      void new Error(SENTINEL);
    });

    bench('NEW  reuse pre-allocated singleton', ITERS, () => {
      void PREALLOC;
    });
  });
});

// ---------------------------------------------------------------------------
// Safe-correctness-check suite: before vs after
// ---------------------------------------------------------------------------

describe('safe-correctness-check micro-opts: before vs after', () => {
  const ITERS = 500_000;
  const ACTION_COUNT = 2736;

  console.log('\n  [correctness-check opts benchmark]');

  // --- D. History scores: Map<number,number> vs Int32Array ------------------

  it('D. history score lookup + update: Map<number,number> vs Int32Array', () => {
    console.log('\n  [D] rememberCutoffMove history path (read + clamped write):');

    const histMap = new Map<number, number>();
    const histArr = new Int32Array(ACTION_COUNT);
    const ids = [42, 137, 800, 1200, 2000];
    const bonus = 4 * 24; // depth=2, bonus*24

    bench('OLD  map.get(id) ?? 0 + map.set(id, min(32k, val+bonus))', ITERS, () => {
      for (const id of ids) {
        const cur = histMap.get(id) ?? 0;
        histMap.set(id, Math.min(32_000, cur + bonus));
      }
    });

    bench('NEW  arr[id] + arr[id] = min(32k, arr[id]+bonus)', ITERS, () => {
      for (const id of ids) {
        histArr[id] = Math.min(32_000, histArr[id] + bonus);
      }
    });
  });

  // --- E. History score read (getDynamicScore path) -------------------------

  it('E. history score read: Map.get vs Int32Array index', () => {
    console.log('\n  [E] getDynamicScore history read (per-action in hot loop):');

    const histMap = new Map<number, number>([[42, 8000], [137, 4000], [800, 12000]]);
    const histArr = new Int32Array(ACTION_COUNT);
    histArr[42] = 8000; histArr[137] = 4000; histArr[800] = 12000;
    const ids = [42, 137, 800, 1200, 2000, 500, 1500, 2200, 10, 99];

    bench('OLD  id >= 0 ? (map.get(id) ?? 0) : 0', ITERS, () => {
      for (const id of ids) void (id >= 0 ? (histMap.get(id) ?? 0) : 0);
    });

    bench('NEW  id >= 0 ? arr[id] : 0', ITERS, () => {
      for (const id of ids) void (id >= 0 ? histArr[id] : 0);
    });
  });

  // --- F. Killer write: spread+slice vs in-place mutation -------------------

  it('F. killer move write: [id,...killers].slice(2) vs in-place array mutation', () => {
    console.log('\n  [F] rememberCutoffMove killer write (on every beta cutoff):');

    const killerMapOld = new Map<number, number[]>();
    const killerMapNew = new Map<number, number[]>();
    const depth = 3;
    const id = 512;

    bench('OLD  map.get + spread + slice + map.set', ITERS, () => {
      const killers = killerMapOld.get(depth) ?? [];
      if (!killers.includes(id)) {
        killerMapOld.set(depth, [id, ...killers].slice(0, 2));
      }
    });

    bench('NEW  map.get + in-place push/shift (no spread, no alloc)', ITERS, () => {
      const killers = killerMapNew.get(depth);
      if (killers === undefined) {
        killerMapNew.set(depth, [id]);
      } else if (!killers.includes(id)) {
        if (killers.length < 2) killers.push(id);
        else { killers[1] = killers[0]; killers[0] = id; }
      }
    });
  });

  // --- G. Killer read: Map.get (unchanged) ----------------------------------

  it('G. killer read: Map.get(depth)??[] — confirming no regression', () => {
    console.log('\n  [G] killer read per orderMoves call (once per node):');

    const killerMap = new Map<number, number[]>([[3, [512, 768]]]);
    const depth = 3;

    bench('SAME map.get(depth) ?? []  (read path unchanged)', ITERS, () => {
      void (killerMap.get(depth) ?? []);
    });

    bench('SAME map.get(depth) ?? []  (cold — depth not found)', ITERS, () => {
      void (killerMap.get(99) ?? []);
    });
  });

  // --- H. Search line: array spread vs push/pop ----------------------------

  it('H. search line: [...line, entry] vs line.push(entry) + line.pop()', () => {
    console.log('\n  [H] search line extension per recursive call (depth-8 simulation):');

    const entry = { action: { type: 'climbOne', source: 'A1', target: 'B2' } as never, actor: 'white' as never, positionKey: 'abc' };
    const mutableLine: typeof entry[] = [];

    bench('OLD  [...searchLine, entry]  (new array each call)', ITERS, () => {
      const line0: typeof entry[] = [];
      const line1 = [...line0, entry];
      const line2 = [...line1, entry];
      const line3 = [...line2, entry];
      const line4 = [...line3, entry];
      void line4;
    });

    bench('NEW  push + pop  (shared mutable array)', ITERS, () => {
      mutableLine.push(entry);
      mutableLine.push(entry);
      mutableLine.push(entry);
      mutableLine.push(entry);
      mutableLine.pop();
      mutableLine.pop();
      mutableLine.pop();
      mutableLine.pop();
    });
  });
});

// ---------------------------------------------------------------------------
// Realistic history heuristic: Map<number,number> vs Int32Array
//
// Simulates real search conditions: history accumulates hundreds of entries
// across iterative deepening, and the hot loop queries a mix of frequently
// recurring IDs (re-searched positions) and cold IDs (novel moves).
// ---------------------------------------------------------------------------

describe('history heuristic: realistic Map vs Int32Array comparison', () => {
  const ACTION_COUNT = 2736;
  const ITERS = 200_000;

  // Build a seeded-random sequence so every run is deterministic
  function lcg(seed: number): () => number {
    let s = seed;
    return () => {
      s = (Math.imul(1664525, s) + 1013904223) | 0;
      return (s >>> 0) / 0xffffffff;
    };
  }

  /** Populate Map and Int32Array with `fillCount` unique random IDs */
  function buildHistory(fillCount: number, rand: () => number): {
    histMap: Map<number, number>;
    histArr: Int32Array;
    hotIds: number[];   // top 10% most-seen IDs (simulating re-searched positions)
    coldIds: number[];  // bottom 30% (novel moves, queried once)
    allIds: number[];
  } {
    const ids = new Set<number>();
    while (ids.size < fillCount) {
      ids.add(Math.floor(rand() * ACTION_COUNT));
    }
    const allIds = [...ids];
    const histMap = new Map<number, number>();
    const histArr = new Int32Array(ACTION_COUNT);
    // Assign plausible scores (0–32000, skewed toward lower values)
    for (const id of allIds) {
      const score = Math.floor(rand() * 32_000);
      histMap.set(id, score);
      histArr[id] = score;
    }
    const hotIds = allIds.slice(0, Math.max(1, Math.floor(fillCount * 0.1)));
    const coldIds = allIds.slice(Math.floor(fillCount * 0.7));
    return { histMap, histArr, hotIds, coldIds, allIds };
  }

  /** Build a realistic query sequence: 60% hot IDs (repeated), 40% cold/miss */
  function buildQuerySeq(hotIds: number[], coldIds: number[], rand: () => number, len = 200): number[] {
    const seq: number[] = [];
    for (let i = 0; i < len; i++) {
      if (rand() < 0.6) {
        seq.push(hotIds[Math.floor(rand() * hotIds.length)]!);
      } else if (coldIds.length > 0 && rand() < 0.5) {
        seq.push(coldIds[Math.floor(rand() * coldIds.length)]!);
      } else {
        // Miss: ID not in history (novel move)
        seq.push(Math.floor(rand() * ACTION_COUNT));
      }
    }
    return seq;
  }

  const bonus = 4 * 24; // depth=2 typical

  for (const fillCount of [50, 300, 800, 1500]) {
    it(`history read+write at ${fillCount} entries: Map vs Int32Array`, () => {
      console.log(`\n  [realistic-${fillCount}] History at ${fillCount} entries — read+write cycle:`);

      const rand = lcg(fillCount * 31337);
      const { histMap, histArr, hotIds, coldIds } = buildHistory(fillCount, rand);
      const querySeq = buildQuerySeq(hotIds, coldIds, rand);

      // Clone so write-path benches don't pollute each other across iterations
      const baseMap = new Map(histMap);
      const baseArr = Int32Array.from(histArr);

      // Reset to base state before each bench — done once before bench() not inside fn
      // (bench() runs fn() repeatedly; we want the map/array to grow naturally as in
      //  real search, not be reset between iterations)
      const writeMap = new Map(baseMap);
      const writeArr = Int32Array.from(baseArr);

      bench(
        `OLD  Map.get(id)??0 + Map.set(id,…)  [${fillCount} entries]`,
        ITERS,
        () => {
          for (const id of querySeq) {
            const cur = writeMap.get(id) ?? 0;
            writeMap.set(id, Math.min(32_000, cur + bonus));
          }
        },
      );

      bench(
        `NEW  arr[id] + arr[id]=…              [${fillCount} entries]`,
        ITERS,
        () => {
          for (const id of querySeq) {
            writeArr[id] = Math.min(32_000, (writeArr[id] ?? 0) + bonus);
          }
        },
      );
    });
  }

  it('history read-only at 800 entries: Map.get vs arr[] (no write)', () => {
    console.log('\n  [realistic-read-only] Read-only path (getDynamicScore, 800 entries):');

    const rand = lcg(800 * 99991);
    const { histMap, histArr, hotIds, coldIds } = buildHistory(800, rand);
    const querySeq = buildQuerySeq(hotIds, coldIds, rand);

    bench('OLD  id>=0 ? (map.get(id)??0) : 0  [800 entries, mixed hot/cold]', ITERS, () => {
      for (const id of querySeq) void (id >= 0 ? (histMap.get(id) ?? 0) : 0);
    });

    bench('NEW  id>=0 ? arr[id] : 0            [800 entries, mixed hot/cold]', ITERS, () => {
      for (const id of querySeq) void (id >= 0 ? histArr[id] : 0);
    });
  });
});

// ---------------------------------------------------------------------------
// End-to-end search throughput: nodes/sec on realistic positions
//
// Closes the loop between the micro-benchmarks above and actual search performance.
// Run this to verify that data-structure optimisations translate into measurable
// search throughput gains, not just isolated op-count wins.
//
// Uses real wall-clock time (performance.now) and seeded random play positions
// that have all pieces active and a typical branching factor (~15-30 legal moves).
// ---------------------------------------------------------------------------

function buildMidgameState(turnCount: number, seed: number) {
  const config = withConfig();
  const rand = createSeededRandom(seed);
  let state = createInitialState(config);

  for (let i = 0; i < turnCount; i++) {
    if (state.status === 'gameOver') break;
    const actions = getLegalActions(state, config);
    if (!actions.length) break;
    state = applyAction(state, actions[Math.floor(rand() * actions.length)]!, config);
  }

  return { config, state };
}

describe('end-to-end search throughput: nodes/sec on realistic positions', () => {
  const RUNS = 5;

  function measureSearchThroughput(
    difficulty: 'easy' | 'medium' | 'hard',
    turnCount: number,
    seed: number,
  ): { avgNodesPerSecond: number; avgCompletedDepth: number; legalActionCount: number } {
    const { config, state } = buildMidgameState(turnCount, seed);
    const legalActionCount = getLegalActions(state, config).length;
    const rand = createSeededRandom(seed + 1);
    let totalNodes = 0;
    let totalWallMs = 0;
    let totalDepth = 0;

    // Warm-up
    chooseComputerAction({ difficulty, random: rand, ruleConfig: config, state });

    for (let i = 0; i < RUNS; i++) {
      const startedAt = performance.now();
      const result = chooseComputerAction({ difficulty, random: rand, ruleConfig: config, state });
      totalWallMs += performance.now() - startedAt;
      totalNodes += result.evaluatedNodes;
      totalDepth += result.completedDepth;
    }

    return {
      avgNodesPerSecond: Math.round(totalNodes / totalWallMs * 1000),
      avgCompletedDepth: Math.round((totalDepth / RUNS) * 10) / 10,
      legalActionCount,
    };
  }

  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    it(`${difficulty}: nodes/sec on midgame20 and midgame40 (realistic branching)`, () => {
      const preset = AI_DIFFICULTY_PRESETS[difficulty];
      const turn20 = measureSearchThroughput(difficulty, 20, 0x1a2b3c);
      const turn40 = measureSearchThroughput(difficulty, 40, 0x4d5e6f);

      console.log(`\n  [throughput] ${difficulty} (budget ${preset.timeBudgetMs}ms, maxDepth ${preset.maxDepth}):`);
      console.log(
        `    midgame20  ${String(turn20.legalActionCount).padStart(2)} legal actions  depth ${turn20.avgCompletedDepth}  ${String(turn20.avgNodesPerSecond).padStart(7)} nps`,
      );
      console.log(
        `    midgame40  ${String(turn40.legalActionCount).padStart(2)} legal actions  depth ${turn40.avgCompletedDepth}  ${String(turn40.avgNodesPerSecond).padStart(7)} nps`,
      );
    }, 60_000);
  }
});
