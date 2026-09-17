/**
 * Core↔Agent v1 envelope backward-compatibility adapter tests (TASK-038).
 * Exercises the pure `unwrapEnvelope` helper in the agent route so a v1 agent
 * message is routed through the same v0 handlers, and v0 remains unchanged.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unwrapEnvelope } from '../routes/agent';

function req(header?: string): { headers: Record<string, string | string[] | undefined> } {
  return { headers: header ? { 'x-protocol-version': header } : {} };
}

test('v0/implicit body passes through unchanged (backward compatible)', () => {
  const body = { hostId: 'h1', hostName: 'host', ip: '10.0.0.5' };
  const u = unwrapEnvelope(req(), body);
  assert.equal(u?.version, 0);
  assert.deepEqual(u?.payload, body);
});

test('v1 envelope is unwrapped to its payload', () => {
  const payload = { hostId: 'h1', hostName: 'host', capabilities: ['cpu'] };
  const u = unwrapEnvelope(req('1'), {
    protocolVersion: 1,
    agentVersion: '2.1.0',
    nodeId: 'h1',
    hostname: 'host',
    timestamp: 1234,
    payload,
  });
  assert.equal(u?.version, 1);
  assert.deepEqual(u?.payload, payload);
});

test('malformed v1 envelope (missing payload) returns null', () => {
  const u = unwrapEnvelope(req('1'), { protocolVersion: 1, nodeId: 'h1' });
  assert.equal(u, null);
});

test('v1 envelope with a non-object payload returns null', () => {
  const u = unwrapEnvelope(req('1'), { protocolVersion: 1, payload: 'not-an-object' });
  assert.equal(u, null);
});

test('empty header is treated as v0', () => {
  const body = { hostId: 'h1' };
  const u = unwrapEnvelope(req(''), body);
  assert.equal(u?.version, 0);
  assert.deepEqual(u?.payload, body);
});