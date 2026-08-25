import { createHash } from 'node:crypto';

export const NAMED_RNG_VERSION = 1;
export const NAMED_RNG_ALGORITHM = 'sha256-counter-u53-v1';

export type NamedRngPurposeV1 =
  | 'fixtureGeneration'
  | 'semanticRollout'
  | 'symmetryOrbit'
  | 'persona'
  | 'policyDecision'
  | 'outcomeContinuation'
  | 'humanAssignment'
  | 'bootstrap'
  | 'powerSimulation';

export type NamedRngKeyV1 = {
  lineageId: string;
  purpose: NamedRngPurposeV1;
  replicate: number;
  runSeed: string;
  step?: number;
  turn?: number;
  variant?: string;
};

function assertCounter(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function canonicalKey(key: NamedRngKeyV1, draw: number): string {
  assertCounter(key.replicate, 'replicate');
  assertCounter(key.step, 'step');
  assertCounter(key.turn, 'turn');
  assertCounter(draw, 'draw');
  return JSON.stringify({
    algorithm: NAMED_RNG_ALGORITHM,
    draw,
    lineageId: key.lineageId,
    purpose: key.purpose,
    replicate: key.replicate,
    runSeed: key.runSeed,
    step: key.step ?? 0,
    turn: key.turn ?? 0,
    variant: key.variant ?? '',
    version: NAMED_RNG_VERSION,
  });
}

export function namedUniform(key: NamedRngKeyV1, draw = 0): number {
  const digest = createHash('sha256').update(canonicalKey(key, draw)).digest();
  const high = digest.readUInt32BE(0) & 0x001fffff;
  const low = digest.readUInt32BE(4);
  return (high * 0x100000000 + low) / 0x20000000000000;
}

export function namedInteger(
  key: NamedRngKeyV1,
  maximumExclusive: number,
  draw = 0,
): number {
  if (!Number.isSafeInteger(maximumExclusive) || maximumExclusive <= 0) {
    throw new RangeError('maximumExclusive must be a positive safe integer.');
  }
  return Math.floor(namedUniform(key, draw) * maximumExclusive);
}

export function namedShuffle<T>(values: readonly T[], key: NamedRngKeyV1): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = namedInteger(key, index + 1, shuffled.length - 1 - index);
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

export function namedRngFingerprint(): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        algorithm: NAMED_RNG_ALGORITHM,
        purposes: [
          'fixtureGeneration',
          'semanticRollout',
          'symmetryOrbit',
          'persona',
          'policyDecision',
          'outcomeContinuation',
          'humanAssignment',
          'bootstrap',
          'powerSimulation',
        ] satisfies NamedRngPurposeV1[],
        version: NAMED_RNG_VERSION,
      }),
    )
    .digest('hex');
}
