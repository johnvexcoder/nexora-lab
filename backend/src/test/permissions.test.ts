import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  roleHasPermission,
  permissionsForRole,
  guestPermissionsFor,
  ALL_PERMISSIONS,
  ROLES,
  GUEST_SCOPES,
} from '../security/permissions.js';
import type { Role, Permission } from '../security/permissions.js';

describe('permissions', () => {
  describe('roleHasPermission', () => {
    it('SUPER_ADMIN has all permissions via wildcard', () => {
      for (const perm of ALL_PERMISSIONS) {
        assert.ok(roleHasPermission('SUPER_ADMIN', perm), `SUPER_ADMIN missing ${perm}`);
      }
    });

    it('ADMIN has all permissions via wildcard', () => {
      for (const perm of ALL_PERMISSIONS) {
        assert.ok(roleHasPermission('ADMIN', perm), `ADMIN missing ${perm}`);
      }
    });

    it('VIEWER has only read permissions', () => {
      const readPerms: Permission[] = [
        'dashboard.view', 'servers.view', 'containers.view', 'vms.view',
        'services.view', 'notifications.view', 'logs.view',
      ];
      for (const perm of readPerms) {
        assert.ok(roleHasPermission('VIEWER', perm), `VIEWER missing expected ${perm}`);
      }
      const writePerms: Permission[] = [
        'servers.manage', 'containers.manage', 'users.manage',
        'settings.manage', 'recovery.manage',
      ];
      for (const perm of writePerms) {
        assert.ok(!roleHasPermission('VIEWER', perm), `VIEWER should not have ${perm}`);
      }
    });

    it('OPERATOR has operational write permissions', () => {
      assert.ok(roleHasPermission('OPERATOR', 'servers.manage'));
      assert.ok(roleHasPermission('OPERATOR', 'containers.manage'));
      assert.ok(roleHasPermission('OPERATOR', 'vms.manage'));
      assert.ok(roleHasPermission('OPERATOR', 'services.manage'));
    });

    it('OPERATOR lacks admin-only permissions', () => {
      assert.ok(!roleHasPermission('OPERATOR', 'users.manage'));
      assert.ok(!roleHasPermission('OPERATOR', 'settings.manage'));
      assert.ok(!roleHasPermission('OPERATOR', 'recovery.manage'));
      assert.ok(!roleHasPermission('OPERATOR', 'backups.manage'));
    });

    it('GUEST has minimal read permissions', () => {
      assert.ok(roleHasPermission('GUEST', 'dashboard.view'));
      assert.ok(roleHasPermission('GUEST', 'servers.view'));
      assert.ok(roleHasPermission('GUEST', 'containers.view'));
      assert.ok(roleHasPermission('GUEST', 'vms.view'));
      assert.ok(roleHasPermission('GUEST', 'services.view'));
      assert.ok(roleHasPermission('GUEST', 'notifications.view'));
    });

    it('GUEST lacks all write permissions', () => {
      assert.ok(!roleHasPermission('GUEST', 'servers.manage'));
      assert.ok(!roleHasPermission('GUEST', 'users.manage'));
      assert.ok(!roleHasPermission('GUEST', 'settings.manage'));
      assert.ok(!roleHasPermission('GUEST', 'logs.view'));
    });
  });

  describe('permissionsForRole', () => {
    it('SUPER_ADMIN and ADMIN return ALL_PERMISSIONS', () => {
      const superAdminPerms = permissionsForRole('SUPER_ADMIN');
      const adminPerms = permissionsForRole('ADMIN');
      assert.deepEqual(superAdminPerms, ALL_PERMISSIONS);
      assert.deepEqual(adminPerms, ALL_PERMISSIONS);
    });

    it('VIEWER returns exactly 7 permissions', () => {
      const perms = permissionsForRole('VIEWER');
      assert.equal(perms.length, 7);
    });

    it('OPERATOR returns more than VIEWER but fewer than ADMIN', () => {
      const viewerCount = permissionsForRole('VIEWER').length;
      const operatorCount = permissionsForRole('OPERATOR').length;
      const adminCount = permissionsForRole('ADMIN').length;
      assert.ok(operatorCount > viewerCount, 'OPERATOR has more perms than VIEWER');
      assert.ok(operatorCount < adminCount, 'OPERATOR has fewer perms than ADMIN');
    });

    it('GUEST returns exactly 6 permissions', () => {
      const perms = permissionsForRole('GUEST');
      assert.equal(perms.length, 6);
    });

    it('returned arrays are distinct instances (no shared mutable state)', () => {
      const a = permissionsForRole('VIEWER');
      const b = permissionsForRole('VIEWER');
      assert.notEqual(a, b, 'should be different array instances');
      assert.deepEqual(a, b, 'but same contents');
    });
  });

  describe('guestPermissionsFor', () => {
    it('returns empty for no scopes', () => {
      assert.deepEqual(guestPermissionsFor([]), []);
    });

    it('deduplicates overlapping scopes', () => {
      const perms = guestPermissionsFor(['cpu', 'ram', 'storage', 'temp', 'uptime']);
      // cpu, ram, storage, temp, uptime all map to dashboard.view
      assert.equal(perms.length, 1);
      assert.ok(perms.includes('dashboard.view'));
    });

    it('ignores unknown scopes', () => {
      const perms = guestPermissionsFor(['unknown_scope', 'nonexistent']);
      assert.deepEqual(perms, []);
    });

    it('maps known scopes to correct permissions', () => {
      const perms = guestPermissionsFor(['serverStatus', 'serviceStatus', 'containers', 'vms']);
      assert.ok(perms.includes('servers.view'));
      assert.ok(perms.includes('services.view'));
      assert.ok(perms.includes('containers.view'));
      assert.ok(perms.includes('vms.view'));
    });

    it('never returns write permissions for guests', () => {
      const allScopeKeys = Object.keys(GUEST_SCOPES);
      const perms = guestPermissionsFor(allScopeKeys);
      const writePerms: Permission[] = [
        'servers.manage', 'containers.manage', 'users.manage',
        'settings.manage', 'recovery.manage', 'backups.manage',
      ];
      for (const wp of writePerms) {
        assert.ok(!perms.includes(wp), `guest scope should not grant ${wp}`);
      }
    });
  });

  describe('ALL_PERMISSIONS', () => {
    it('contains exactly 25 permissions', () => {
      assert.equal(ALL_PERMISSIONS.length, 25);
    });

    it('has no duplicates', () => {
      const unique = new Set(ALL_PERMISSIONS);
      assert.equal(unique.size, ALL_PERMISSIONS.length, 'ALL_PERMISSIONS has duplicates');
    });
  });

  describe('ROLES', () => {
    it('contains all 5 roles in ascending privilege order', () => {
      assert.deepEqual(ROLES, ['GUEST', 'VIEWER', 'OPERATOR', 'ADMIN', 'SUPER_ADMIN']);
    });
  });

  describe('privilege hierarchy', () => {
    it('each higher role has at least all permissions of the lower role', () => {
      const roleOrder: Role[] = ['GUEST', 'VIEWER', 'OPERATOR', 'ADMIN', 'SUPER_ADMIN'];
      for (let i = 1; i < roleOrder.length; i++) {
        const lower = permissionsForRole(roleOrder[i - 1]);
        const higher = permissionsForRole(roleOrder[i]);
        for (const perm of lower) {
          assert.ok(
            higher.includes(perm),
            `${roleOrder[i]} should include ${perm} from ${roleOrder[i - 1]}`,
          );
        }
      }
    });
  });
});
