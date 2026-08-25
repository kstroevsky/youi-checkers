import { describe, expect, it } from 'vitest';

import {
  createFixtureCatalog,
  fixtureCatalogHash,
  type FixtureLineageV1,
} from '@/ai/test/fixtureCatalog.node';
import { createCompleteAiRootContext } from '@/ai/test/rootContext';
import { createInitialState } from '@/domain';
import { withConfig } from '@/test/factories';

function lineage(id: string): FixtureLineageV1 {
  return {
    lineageId: id,
    rootContext: createCompleteAiRootContext(createInitialState(withConfig())),
    strata: {
      advantage: 'approximatelyEqual',
      historyPressure: 'clean',
      origin: 'handAuthored',
      phase: 'opening',
      plan: 'hybrid',
      tactics: 'quiet',
      topology: 'congested',
    },
  };
}

describe('FixtureCatalogV1', () => {
  it('sorts lineage identity and hashes it independently of insertion order', () => {
    const first = createFixtureCatalog({
      generatorHash: 'generator',
      lineages: [lineage('b'), lineage('a')],
      namedRngHash: 'rng',
      sealed: false,
    });
    const secondIdentity = {
      generatorHash: 'generator',
      generatorVersion: 1 as const,
      lineages: [lineage('a'), lineage('b')],
      namedRngHash: 'rng',
      schemaVersion: 1 as const,
      sealed: false,
    };

    expect(first.lineages.map((entry) => entry.lineageId)).toEqual(['a', 'b']);
    expect(first.catalogHash).toBe(fixtureCatalogHash(secondIdentity));
  });

  it('rejects duplicate lineage IDs', () => {
    expect(() =>
      createFixtureCatalog({
        generatorHash: 'generator',
        lineages: [lineage('a'), lineage('a')],
        namedRngHash: 'rng',
        sealed: false,
      }),
    ).toThrow('unique');
  });
});
