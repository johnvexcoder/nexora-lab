import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-readiness-'));
process.env.DATA_DIR = dataDir;
process.env.MOCK_MODE = 'false';
process.env.ADMIN_INITIAL_PASSWORD = 'Zq7!mN4pRt9W';
process.env.SECRET_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

test.after(async () => {
  const { closeDb } = await import('../db/database');
  closeDb();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('production config rejects malformed values and partial credentials', () => {
  for (const env of [
    { PORT: '4000oops' }, { PORT: '65536' }, { MOCK_MODE: 'yes' },
    { ADMIN_INITIAL_PASSWORD: 'short' }, { SECRET_ENCRYPTION_KEY: 'weak' },
    { PROXMOX_HOST: 'https://pve.example:8006', PROXMOX_TOKEN_ID: '', PROXMOX_TOKEN_SECRET: '' },
  ]) {
    const child = spawnSync(process.execPath, ['--import', 'tsx', '-e', "require('./src/config.ts').validateProductionConfig()"], {
      cwd: path.resolve(__dirname, '../..'), env: { ...process.env, ...env }, encoding: 'utf8',
    });
    assert.notEqual(child.status, 0, JSON.stringify(env));
    assert.match(child.stderr, /Error/);
  }
});

test('bootstrap preserves credentials across restart and rejects an unusable initial password', async () => {
  const { bootstrapSecurity } = await import('../security/boot');
  const { getDb, closeDb } = await import('../db/database');
  bootstrapSecurity();
  const initial = getDb().prepare('SELECT password_hash FROM users WHERE username=?').get('admin');
  closeDb();
  process.env.ADMIN_INITIAL_PASSWORD = 'Different-long-passphrase!';
  bootstrapSecurity();
  assert.deepEqual(getDb().prepare('SELECT password_hash FROM users WHERE username=?').get('admin'), initial);
  process.env.ADMIN_INITIAL_PASSWORD = 'short';
  assert.throws(bootstrapSecurity, /at least 10/);
  process.env.ADMIN_INITIAL_PASSWORD = 'Zq7!mN4pRt9W';
});

test('backup round trip preserves data and rejects a foreign database', async () => {
  const { createBackup, listBackups, restoreBackup } = await import('../services/backups');
  const { getDb } = await import('../db/database');
  const { setSetting, getSetting } = await import('../security/settings');
  setSetting('test.restore', 'before');
  const backup = await createBackup('manual', 'test');
  assert.equal(typeof listBackups()[0].createdAt, 'number');
  assert.equal(fs.statSync(backup.file).mode & 0o777, 0o600);
  setSetting('test.restore', 'after');
  assert.equal(restoreBackup(backup.file).restored, true);
  assert.equal(getSetting('test.restore'), 'before');
  const other = path.join(dataDir, 'foreign.db');
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(other); db.exec('CREATE TABLE unrelated(id INTEGER)'); db.close();
  assert.equal(restoreBackup(other).restored, false);
  assert.equal(getDb().pragma('quick_check', { simple: true }), 'ok');
});

test('composite accepts a provider without notification hooks', async () => {
  const { CompositeProvider } = await import('../providers/compositeProvider');
  const { AgentMetricsProvider } = await import('../providers/agentMetricsProvider');
  const provider = new AgentMetricsProvider();
  const composite = new CompositeProvider(provider);
  assert.doesNotThrow(() => composite.onNotifications(() => {}));
});
