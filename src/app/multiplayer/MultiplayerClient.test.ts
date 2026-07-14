import { describe, expect, it, vi } from 'vitest';

import { MultiplayerClient } from './MultiplayerClient';

describe('MultiplayerClient lifetime', () => {
  it('starts and disposes browser listeners explicitly', () => {
    const addEventListener = vi.spyOn(document, 'addEventListener');
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    const client = new MultiplayerClient({
      getCreateOptions: () => ({
        format: 'single',
        rules: {
          allowNonAdjacentFriendlyStackTransfer: true,
          drawRule: 'threefold',
          scoringMode: 'off',
        },
        targetPoints: 1,
      }),
      project: () => undefined,
      setView: () => undefined,
    });

    expect(addEventListener).not.toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );

    client.start();
    client.dispose();

    expect(addEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
    expect(removeEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
  });
});
