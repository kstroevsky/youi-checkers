export const RERANKER_BASE_WEIGHTS_V1 = {
  history: 0.25,
  participation: 0.25,
  persona: 0.2,
  plan: 0.3,
  progress: 0.2,
  risk: 0.5,
  strength: 1,
} as const;

export function rerankerCoefficientNeighborhoodV1() {
  const variants = [{ id: 'base', weights: { ...RERANKER_BASE_WEIGHTS_V1 } }];
  for (const name of Object.keys(RERANKER_BASE_WEIGHTS_V1) as Array<
    keyof typeof RERANKER_BASE_WEIGHTS_V1
  >) {
    for (const multiplier of [0.75, 1.25] as const) {
      variants.push({
        id: `${name}-${multiplier}`,
        weights: {
          ...RERANKER_BASE_WEIGHTS_V1,
          [name]: RERANKER_BASE_WEIGHTS_V1[name] * multiplier,
        },
      });
    }
  }
  return variants.flatMap((variant) =>
    ([0.25, 0.5, 1, 2] as const).map((temperature) => ({
      ...variant,
      id: `${variant.id}/tau-${temperature}`,
      temperature,
    })),
  );
}
