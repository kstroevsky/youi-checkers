import { it, expect } from 'vitest';

import { runAiSoakPlayout } from '@/ai/test/searchTestUtils';

for (const difficulty of ['easy', 'medium', 'hard'] as const) {
  const stableCalls = difficulty === 'easy' ? 8 : difficulty === 'medium' ? 10 : 12;

  it(`survives a 200-turn AI-vs-AI soak on ${difficulty}`, () => {
    const stats = runAiSoakPlayout(difficulty, 200, stableCalls);
    expect(stats.turnsCompleted).toBe(200);
    console.log(
      `[soak] ${difficulty} 200t: ${stats.avgNodesPerSecond} nps avg, min depth ${stats.minCompletedDepth}`,
    );
  }, 20_000);

  it(`survives a 500-turn AI-vs-AI soak on ${difficulty}`, () => {
    const stats = runAiSoakPlayout(difficulty, 500, stableCalls);
    expect(stats.turnsCompleted).toBe(500);
    console.log(
      `[soak] ${difficulty} 500t: ${stats.avgNodesPerSecond} nps avg, min depth ${stats.minCompletedDepth}`,
    );
  }, 35_000);
}
