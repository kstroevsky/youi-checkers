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

  it('drops buffered and future signals while diagnostics are disabled', () => {
    const { connect, setEnabled, sink } = createBufferedTelemetrySink();
    const target: TelemetrySink = {
      context: vi.fn(),
      flushGameComplete: vi.fn(),
      incident: vi.fn(),
      increment: vi.fn(),
      measure: vi.fn(),
      setMatchContext: vi.fn(),
    };

    sink.increment('before_opt_out');
    setEnabled(false);
    sink.increment('while_disabled');
    connect(target);
    setEnabled(true);
    sink.increment('after_opt_in');

    expect(target.increment).toHaveBeenCalledTimes(1);
    expect(target.increment).toHaveBeenCalledWith('after_opt_in', undefined);
  });

  it('buffers post-opt-in signals until a replacement collector connects', () => {
    const { connect, disconnect, setEnabled, sink } = createBufferedTelemetrySink();
    const firstTarget: TelemetrySink = {
      context: vi.fn(),
      flushGameComplete: vi.fn(),
      incident: vi.fn(),
      increment: vi.fn(),
      measure: vi.fn(),
      setMatchContext: vi.fn(),
    };
    const nextTarget: TelemetrySink = {
      context: vi.fn(),
      flushGameComplete: vi.fn(),
      incident: vi.fn(),
      increment: vi.fn(),
      measure: vi.fn(),
      setMatchContext: vi.fn(),
    };

    connect(firstTarget);
    setEnabled(false);
    disconnect();
    setEnabled(true);
    sink.increment('after_opt_in');
    connect(nextTarget);

    expect(firstTarget.increment).not.toHaveBeenCalled();
    expect(nextTarget.increment).toHaveBeenCalledWith('after_opt_in', undefined);
  });
});
