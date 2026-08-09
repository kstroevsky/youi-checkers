import {
  stabilizeStrategicIntent,
  STRATEGIC_PLAN_SWITCH_MARGIN,
  type IntentProfile,
} from '@/ai/strategy';

import { describe, expect, it } from 'vitest';

function profile(
  intent: IntentProfile['intent'],
  homePlanPotential: number,
  sixStackPlanPotential: number,
): IntentProfile {
  return {
    homePlanPotential,
    hybridPlanPotential: Math.round(
      homePlanPotential * 0.58 + sixStackPlanPotential * 0.42,
    ),
    intent,
    intentDelta: Math.abs(sixStackPlanPotential - homePlanPotential),
    sixStackPlanPotential,
  };
}

describe('strategic plan hysteresis', () => {
  it('uses the live classifier before a plan is committed', () => {
    expect(stabilizeStrategicIntent(profile('sixStack', 100, 900), null)).toBe(
      'sixStack',
    );
  });

  it('preserves commitment through an ambiguous hybrid state', () => {
    expect(
      stabilizeStrategicIntent(profile('hybrid', 1_000, 1_100), 'home'),
    ).toBe('home');
  });

  it('rejects threshold-noise switches below the hysteresis margin', () => {
    expect(
      stabilizeStrategicIntent(
        profile('sixStack', 1_000, 1_000 + STRATEGIC_PLAN_SWITCH_MARGIN - 1),
        'home',
      ),
    ).toBe('home');
  });

  it('switches when the alternative becomes materially stronger', () => {
    expect(
      stabilizeStrategicIntent(
        profile('sixStack', 1_000, 1_000 + STRATEGIC_PLAN_SWITCH_MARGIN),
        'home',
      ),
    ).toBe('sixStack');
  });
});
