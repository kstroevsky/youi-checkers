import type { RuleConfig } from '@/domain/model/types';

export type RuleToggleDescriptor = {
  key: keyof RuleConfig;
  labelKey:
    | 'rule.nonAdjacentFriendlyTransfer'
    | 'rule.threefoldDraw'
    | 'rule.basicScore';
  glossaryTermId:
    | 'friendlyStackTransfer'
    | 'threefoldDraw'
    | 'scoreMode';
  isEnabled: (config: RuleConfig) => boolean;
  getPatch: (enabled: boolean) => Partial<RuleConfig>;
};

export const RULE_DEFAULTS: RuleConfig = {
  allowNonAdjacentFriendlyStackTransfer: true,
  drawRule: 'threefold',
  scoringMode: 'basic',
};

export const RULE_TOGGLE_DESCRIPTORS: RuleToggleDescriptor[] = [
  {
    key: 'allowNonAdjacentFriendlyStackTransfer',
    labelKey: 'rule.nonAdjacentFriendlyTransfer',
    glossaryTermId: 'friendlyStackTransfer',
    isEnabled: (config) => config.allowNonAdjacentFriendlyStackTransfer,
    getPatch: (enabled) => ({
      allowNonAdjacentFriendlyStackTransfer: enabled,
    }),
  },
  {
    key: 'drawRule',
    labelKey: 'rule.threefoldDraw',
    glossaryTermId: 'threefoldDraw',
    isEnabled: (config) => config.drawRule === 'threefold',
    getPatch: (enabled) => ({
      drawRule: enabled ? 'threefold' : 'none',
    }),
  },
  {
    key: 'scoringMode',
    labelKey: 'rule.basicScore',
    glossaryTermId: 'scoreMode',
    isEnabled: (config) => config.scoringMode === 'basic',
    getPatch: (enabled) => ({
      scoringMode: enabled ? 'basic' : 'off',
    }),
  },
];

export function withRuleDefaults(overrides: Partial<RuleConfig> = {}): RuleConfig {
  return {
    ...RULE_DEFAULTS,
    ...overrides,
  };
}
