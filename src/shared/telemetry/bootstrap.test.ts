import { describe, expect, it, vi } from 'vitest';

import type { TelemetrySink } from '@/shared/telemetry/contracts';
import { createBufferedTelemetrySink } from '@/shared/telemetry/bootstrap';

describe('telemetry bootstrap proxy', () => {
  it('replays a bounded set of early signals after the collector connects', () => {
    const { connect, sink } = createBufferedTelemetrySink(2);
    const target: TelemetrySink = {
      context: vi.fn(),
      flushGameComplete: vi.fn(),
      incident: vi.fn(),
      increment: vi.fn(),
      measure: vi.fn(),
      setMatchContext: vi.fn(),
    };

    sink.increment('dropped');
    sink.measure('startup_ms', 12);
    sink.setMatchContext('computer', 'hard');
    connect(target);

    expect(target.increment).not.toHaveBeenCalled();
    expect(target.measure).toHaveBeenCalledWith('startup_ms', 12);
    expect(target.setMatchContext).toHaveBeenCalledWith('computer', 'hard');
  });
});
