import { it } from 'vitest';

import { runAiSoakPlayout } from '@/ai/test/searchTestUtils';

for (const difficulty of ['easy', 'medium', 'hard'] as const) {
  const stableCalls = difficulty === 'easy' ? 8 : difficulty === 'medium' ? 10 : 12;

  it(`survives a 200-turn AI-vs-AI soak on ${difficulty}`, () => {
    runAiSoakPlayout(difficulty, 200, stableCalls);
  }, 20_000);

  it(`survives a 500-turn AI-vs-AI soak on ${difficulty}`, () => {
    runAiSoakPlayout(difficulty, 500, stableCalls);
  }, 35_000);
}
