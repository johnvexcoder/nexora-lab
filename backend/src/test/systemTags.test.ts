import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'systags-test-'));
process.env.DATA_DIR = dataDir;
process.env.MOCK_MODE = 'false';
process.env.ADMIN_INITIAL_PASSWORD = 'Admin#Test2026Zz';
process.env.SECRET_ENCRYPTION_KEY = 'test-key-000000000000000000000000000000';

let setSetting: (key: string, value: string | boolean | number) => void;
let getSelectedSystemTags: () => string[];
let resolveSystemTags: (
  report?: Record<string, { installed?: boolean; running?: boolean }> | null,
) => Array<{ id: string; label: string; installed: boolean; running: boolean }>;
let SYSTEM_TAGS: readonly { id: string; label: string }[];

before(async () => {
  const settingsMod = await import('../security/settings.js');
  setSetting = settingsMod.setSetting;

  // Initialize the DB so settings table exists
  const dbMod = await import('../db/database.js');
  dbMod.getDb();

  const sysTagsMod = await import('../services/systemTags.js');
  getSelectedSystemTags = sysTagsMod.getSelectedSystemTags;
  resolveSystemTags = sysTagsMod.resolveSystemTags;
  SYSTEM_TAGS = sysTagsMod.SYSTEM_TAGS;
});

after(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('systemTags', () => {
  describe('SYSTEM_TAGS constant', () => {
    it('contains exactly 6 tag definitions', () => {
      assert.equal(SYSTEM_TAGS.length, 6);
    });

    it('each tag has a unique id', () => {
      const ids = SYSTEM_TAGS.map((t) => t.id);
      const unique = new Set(ids);
      assert.equal(unique.size, ids.length, 'duplicate tag ids found');
    });

    it('each tag has a non-empty label', () => {
      for (const tag of SYSTEM_TAGS) {
        assert.ok(tag.label.length > 0, `tag ${tag.id} has empty label`);
      }
    });
  });

  describe('getSelectedSystemTags', () => {
    it('returns configured tags within max 3', () => {
      setSetting('system.tags', JSON.stringify(['ssh', 'docker', 'lm-sensors', 'containerd']));
      const tags = getSelectedSystemTags();
      assert.ok(tags.length <= 3, `Expected at most 3 tags, got ${tags.length}`);
      assert.ok(tags.includes('ssh'));
      assert.ok(tags.includes('docker'));
      assert.ok(tags.includes('lm-sensors'));
    });

    it('filters out invalid tag ids', () => {
      setSetting('system.tags', JSON.stringify(['ssh', 'invalid_tag', 'docker']));
      const tags = getSelectedSystemTags();
      assert.ok(!tags.includes('invalid_tag'));
      assert.ok(tags.includes('ssh'));
      assert.ok(tags.includes('docker'));
    });

    it('returns empty when setting is not an array', () => {
      setSetting('system.tags', 'not-an-array');
      const tags = getSelectedSystemTags();
      assert.deepEqual(tags, []);
    });

    it('returns valid tags in canonical SYSTEM_TAGS order', () => {
      setSetting('system.tags', JSON.stringify(['networkmanager', 'containerd', 'ssh']));
      const tags = getSelectedSystemTags();
      // Canonical order: ssh (4th in SYSTEM_TAGS), containerd (5th), networkmanager (6th)
      assert.deepEqual(tags, ['ssh', 'containerd', 'networkmanager']);
    });
  });

  describe('resolveSystemTags', () => {
    it('resolves selected tags into states from a report', () => {
      setSetting('system.tags', JSON.stringify(['ssh', 'docker']));
      const report = {
        ssh: { installed: true, running: true },
        docker: { installed: true, running: false },
      };
      const states = resolveSystemTags(report);
      assert.equal(states.length, 2);
      // Canonical SYSTEM_TAGS order: docker (2nd) before ssh (4th)
      const docker = states.find((s) => s.id === 'docker');
      const ssh = states.find((s) => s.id === 'ssh');
      assert.ok(docker && ssh, 'both tags resolved');
      assert.equal(docker.installed, true);
      assert.equal(docker.running, false);
      assert.equal(ssh.installed, true);
      assert.equal(ssh.running, true);
    });

    it('defaults to not-installed/not-running when report is missing keys', () => {
      setSetting('system.tags', JSON.stringify(['ssh']));
      const states = resolveSystemTags({});
      assert.equal(states.length, 1);
      assert.equal(states[0].installed, false);
      assert.equal(states[0].running, false);
    });

    it('returns empty when no tags selected', () => {
      setSetting('system.tags', JSON.stringify([]));
      const states = resolveSystemTags({ ssh: { installed: true, running: true } });
      assert.deepEqual(states, []);
    });

    it('handles null report gracefully', () => {
      setSetting('system.tags', JSON.stringify(['ssh']));
      const states = resolveSystemTags(null);
      assert.equal(states.length, 1);
      assert.equal(states[0].installed, false);
      assert.equal(states[0].running, false);
    });

    it('handles undefined report gracefully', () => {
      setSetting('system.tags', JSON.stringify(['docker']));
      const states = resolveSystemTags(undefined);
      assert.equal(states.length, 1);
      assert.equal(states[0].id, 'docker');
      assert.equal(states[0].installed, false);
    });

    it('each state has a non-empty label from SYSTEM_TAGS', () => {
      setSetting('system.tags', JSON.stringify(['ssh', 'docker', 'lm-sensors']));
      const states = resolveSystemTags({});
      for (const state of states) {
        const meta = SYSTEM_TAGS.find((t) => t.id === state.id);
        assert.ok(meta, `SYSTEM_TAGS missing entry for ${state.id}`);
        assert.equal(state.label, meta.label);
      }
    });
  });
});
