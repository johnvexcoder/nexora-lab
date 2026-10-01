import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STALE_THRESHOLD_MS,
  statusTextClass,
  statusDotClass,
  compactClusterLabel,
  getSecondaryRole,
  systemTagToneClass,
  STATUS_META,
  REACH_META,
  SEVERITY_META,
  ROLE_META,
  CAPABILITY_META,
} from '@/lib/constants';
import { cn } from '@/lib/utils';

describe('constants', () => {
  describe('STALE_THRESHOLD_MS', () => {
    it('is 30 seconds matching the backend', () => {
      assert.equal(STALE_THRESHOLD_MS, 30_000);
    });
  });

  describe('statusTextClass', () => {
    it('maps semantic states to dedicated tone classes', () => {
      assert.equal(statusTextClass('online'), 'text-success');
      assert.equal(statusTextClass('degraded'), 'text-warn');
      assert.equal(statusTextClass('offline'), 'text-crit');
    });

    it('falls back to muted text for unknown states', () => {
      assert.equal(statusTextClass('unknown'), 'text-text-muted');
      assert.equal(statusTextClass('stale'), 'text-text-muted');
      assert.equal(statusTextClass(''), 'text-text-muted');
    });
  });

  describe('statusDotClass', () => {
    it('maps semantic states to dot background classes', () => {
      assert.equal(statusDotClass('online'), 'bg-success');
      assert.equal(statusDotClass('degraded'), 'bg-warn');
      assert.equal(statusDotClass('offline'), 'bg-crit');
    });

    it('falls back to muted for unknown states', () => {
      assert.equal(statusDotClass('unknown'), 'bg-text-muted');
    });
  });

  describe('compactClusterLabel', () => {
    it('strips legacy and Nexora Lab prefixes', () => {
      assert.equal(compactClusterLabel('HomeLab Cluster'), 'Cluster');
      assert.equal(compactClusterLabel('Nexora Main'), 'Main');
      assert.equal(compactClusterLabel('Nexora Lab Proxmox Cluster'), 'Proxmox Cluster');
    });

    it('does not strip when there is no whitespace after the prefix', () => {
      assert.equal(compactClusterLabel('homelab-edge'), 'homelab-edge');
      assert.equal(compactClusterLabel('NEXORA-PROD'), 'NEXORA-PROD');
    });

    it('returns original name when no prefix', () => {
      assert.equal(compactClusterLabel('Main Cluster'), 'Main Cluster');
    });

    it('returns original when prefix-only string trims to empty', () => {
      assert.equal(compactClusterLabel('HomeLab'), 'HomeLab');
    });
  });

  describe('systemTagToneClass', () => {
    it('installed + running is a positive/info tone', () => {
      const cls = systemTagToneClass({ installed: true, running: true });
      assert.ok(cls.includes('text-info'), 'running tone should use info text');
    });

    it('installed but not running is a critical tone', () => {
      const cls = systemTagToneClass({ installed: true, running: false });
      assert.ok(cls.includes('text-crit'), 'installed-but-stopped tone should be critical');
    });

    it('not installed is neutral/muted', () => {
      const cls = systemTagToneClass({ installed: false, running: false });
      assert.ok(cls.includes('text-text-muted'), 'not-installed tone should be muted');
    });
  });

  describe('getSecondaryRole', () => {
    const base = {
      spec: {
        role: 'server',
        profile: { containers: 0, vms: 0 },
        clusterId: null as string | null,
      },
    };

    it('hypervisor shows cluster name when known', () => {
      const result = getSecondaryRole(
        { ...base, spec: { ...base.spec, role: 'hypervisor', clusterId: 'c1' } },
        [{ id: 'c1', name: 'HomeLab Main' }],
      );
      assert.equal(result?.label, 'Main');
    });

    it('hypervisor without matching cluster shows default Proxmox label', () => {
      const result = getSecondaryRole({ ...base, spec: { ...base.spec, role: 'hypervisor' } }, []);
      assert.equal(result?.label, 'Proxmox Cluster');
      const noMatch = getSecondaryRole(
        { ...base, spec: { ...base.spec, role: 'hypervisor', clusterId: 'c9' } },
        [{ id: 'c1', name: 'Some Cluster' }],
      );
      assert.equal(noMatch?.label, 'Proxmox Cluster');
    });

    it('server with containers → CONTAINERS', () => {
      const result = getSecondaryRole({
        ...base,
        spec: { ...base.spec, profile: { containers: 3, vms: 0 } },
      });
      assert.equal(result?.label, 'CONTAINERS');
    });

    it('bare server → VIRTUAL MACHINE', () => {
      const result = getSecondaryRole(base);
      assert.equal(result?.label, 'VIRTUAL MACHINE');
    });

    it('docker role → DOCKER HOST', () => {
      const result = getSecondaryRole({ ...base, spec: { ...base.spec, role: 'docker' } });
      assert.equal(result?.label, 'DOCKER HOST');
    });

    it('storage → NAS', () => {
      const result = getSecondaryRole({ ...base, spec: { ...base.spec, role: 'storage' } });
      assert.equal(result?.label, 'NAS');
    });

    it('gateway → GATEWAY', () => {
      const result = getSecondaryRole({ ...base, spec: { ...base.spec, role: 'gateway' } });
      // profile.containers is 0, so skips the CONTAINERS branch and hits the gateway branch
      assert.equal(result?.label, 'GATEWAY');
    });

    it('gateway with containers still shows CONTAINERS', () => {
      const result = getSecondaryRole({
        ...base,
        spec: { ...base.spec, role: 'gateway', profile: { containers: 2, vms: 0 } },
      });
      assert.equal(result?.label, 'CONTAINERS');
    });

    it('unmatched role returns null', () => {
      const result = getSecondaryRole({ ...base, spec: { ...base.spec, role: 'switch' } });
      assert.equal(result, null);
    });
  });

  describe('metadata registries', () => {
    it('STATUS_META covers online/degraded/offline', () => {
      assert.deepEqual(Object.keys(STATUS_META).sort(), ['degraded', 'offline', 'online']);
      for (const s of Object.keys(STATUS_META)) {
        assert.ok(STATUS_META[s as keyof typeof STATUS_META].label);
      }
    });

    it('SEVERITY_META covers all severities', () => {
      const severities = Object.keys(SEVERITY_META).sort();
      assert.deepEqual(severities, ['critical', 'info', 'success', 'warning']);
      for (const s of severities) {
        assert.ok(SEVERITY_META[s as keyof typeof SEVERITY_META].label);
      }
    });

    it('ROLE_META covers every ServerRole', () => {
      const roles = ['hypervisor', 'server', 'vm', 'lxc', 'docker', 'storage', 'network', 'gateway', 'switch'];
      for (const role of roles) {
        assert.ok(ROLE_META[role], `missing ROLE_META for ${role}`);
      }
    });

    it('CAPABILITY_META covers the capability set', () => {
      const caps = ['virtualization', 'containerization', 'storage', 'gateway', 'switching', 'monitoring'];
      for (const cap of caps) {
        assert.ok(CAPABILITY_META[cap], `missing CAPABILITY_META for ${cap}`);
      }
    });
  });

  describe('cn utility', () => {
    it('joins string parts and filters falsy values', () => {
      const shouldJoin = false;
      const result = cn('a', 'b', shouldJoin && 'c', null, undefined);
      assert.equal(result, 'a b');
    });
  });
});
