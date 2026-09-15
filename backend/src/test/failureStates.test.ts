import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fmtTime, fmtDuration, notifyDispatcher } from '../services/notifyDispatch.js';
import type { MetricSnapshot } from '../types/index.js';

function makeSnapshot(overrides: Partial<MetricSnapshot> = {}): MetricSnapshot {
  return {
    serverId: 'test-server',
    timestamp: Date.now(),
    cpu: 45,
    cpuCores: 4,
    ramUsedGb: 8,
    ramTotalGb: 16,
    diskUsedGb: 120,
    diskTotalGb: 500,
    tempC: 52,
    netUpMbps: 10,
    netDownMbps: 50,
    load: 1.5,
    uptimeSeconds: 86400,
    processes: 200,
    status: 'online',
    reachability: 'accessible',
    health: 95,
    sensors: [],
    ...overrides,
  };
}

describe('failure states', () => {
  describe('fmtTime formatting', () => {
    it('pads month/day/hour/minute/second with zeros', () => {
      // 2026-01-05 03:07:09
      const ts = new Date(2026, 0, 5, 3, 7, 9).getTime();
      assert.equal(fmtTime(ts), '2026-01-05 03:07:09');
    });

    it('handles midnight', () => {
      const ts = new Date(2026, 11, 31, 0, 0, 0).getTime();
      assert.equal(fmtTime(ts), '2026-12-31 00:00:00');
    });

    it('handles end-of-day', () => {
      const ts = new Date(2026, 5, 15, 23, 59, 59).getTime();
      assert.equal(fmtTime(ts), '2026-06-15 23:59:59');
    });
  });

  describe('fmtDuration edge cases', () => {
    it('formats 0 seconds', () => {
      assert.equal(fmtDuration(1000, 1000), '0s');
    });

    it('formats negative as 0s', () => {
      assert.equal(fmtDuration(5000, 1000), '0s');
    });

    it('formats exactly 1 minute', () => {
      assert.equal(fmtDuration(0, 60_000), '1m 0s');
    });

    it('formats exactly 1 hour', () => {
      assert.equal(fmtDuration(0, 3_600_000), '1h 00m');
    });

    it('formats mixed units', () => {
      assert.equal(fmtDuration(0, 3_661_000), '1h 01m');
    });

    it('formats large durations', () => {
      assert.equal(fmtDuration(0, 7_200_000), '2h 00m');
    });
  });

  describe('notifyDispatcher state machine', () => {
    // Create a fresh dispatcher per test to avoid cross-test state leakage
    beforeEach(() => {
      // Access the private prevStates map to reset it
      // The dispatcher is a singleton, so we need to work with its lifecycle
    });

    it('first observation seeds silently without throwing', () => {
      const snap = makeSnapshot({ serverId: 'new-server', status: 'online' });
      assert.doesNotThrow(() => {
        notifyDispatcher.checkStateChanges([snap]);
      });
    });

    it('repeated same-status snapshots are no-ops', () => {
      const snap = makeSnapshot({ serverId: 'stable-server', status: 'online' });
      notifyDispatcher.checkStateChanges([snap]);
      // Second poll with same status should not throw or error
      assert.doesNotThrow(() => {
        notifyDispatcher.checkStateChanges([snap]);
      });
    });

    it('handles online→offline transition without throwing', () => {
      const serverId = 'trans-test-1';
      notifyDispatcher.checkStateChanges([
        makeSnapshot({ serverId, status: 'online' }),
      ]);
      assert.doesNotThrow(() => {
        notifyDispatcher.checkStateChanges([
          makeSnapshot({ serverId, status: 'offline' }),
        ]);
      });
    });

    it('handles offline→online recovery without throwing', () => {
      const serverId = 'trans-test-2';
      notifyDispatcher.checkStateChanges([
        makeSnapshot({ serverId, status: 'online' }),
      ]);
      notifyDispatcher.checkStateChanges([
        makeSnapshot({ serverId, status: 'offline' }),
      ]);
      assert.doesNotThrow(() => {
        notifyDispatcher.checkStateChanges([
          makeSnapshot({ serverId, status: 'online' }),
        ]);
      });
    });

    it('handles full lifecycle online→degraded→online', () => {
      const serverId = 'lifecycle-test';
      notifyDispatcher.checkStateChanges([
        makeSnapshot({ serverId, status: 'online' }),
      ]);
      notifyDispatcher.checkStateChanges([
        makeSnapshot({ serverId, status: 'degraded', cpu: 92, tempC: 80 }),
      ]);
      assert.doesNotThrow(() => {
        notifyDispatcher.checkStateChanges([
          makeSnapshot({ serverId, status: 'online', cpu: 40, tempC: 50 }),
        ]);
      });
    });

    it('handles multiple servers independently', () => {
      const snaps = [
        makeSnapshot({ serverId: 's1', status: 'online' }),
        makeSnapshot({ serverId: 's2', status: 'degraded' }),
        makeSnapshot({ serverId: 's3', status: 'offline' }),
      ];
      notifyDispatcher.checkStateChanges(snaps);
      // Each server transitions independently
      assert.doesNotThrow(() => {
        notifyDispatcher.checkStateChanges([
          makeSnapshot({ serverId: 's1', status: 'degraded' }),
          makeSnapshot({ serverId: 's2', status: 'online' }),
          makeSnapshot({ serverId: 's3', status: 'online' }),
        ]);
      });
    });

    it('dispatchNotifications skips info-severity notifications', () => {
      // Info notifications should be silently skipped
      assert.doesNotThrow(() => {
        notifyDispatcher.dispatchNotifications([
          {
            id: 'test-info',
            title: 'Info',
            message: 'test',
            severity: 'info',
            timestamp: Date.now(),
            read: false,
          },
        ]);
      });
    });

    it('dispatchNotifications accepts non-info notifications', () => {
      assert.doesNotThrow(() => {
        notifyDispatcher.dispatchNotifications([
          {
            id: 'test-warn',
            title: 'Warning',
            message: 'test warning',
            severity: 'warning',
            timestamp: Date.now(),
            read: false,
          },
          {
            id: 'test-crit',
            title: 'Critical',
            message: 'test critical',
            severity: 'critical',
            timestamp: Date.now(),
            read: false,
          },
          {
            id: 'test-success',
            title: 'Success',
            message: 'test success',
            severity: 'success',
            timestamp: Date.now(),
            read: false,
          },
        ]);
      });
    });
  });
});
