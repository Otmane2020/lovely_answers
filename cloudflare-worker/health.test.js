import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

test('Cloud monitor returns 200 only when database and auth pass', async () => {
  const original = globalThis.fetch;
  try {
    for (const [database, auth, expected] of [[true, true, 200], [false, true, 503], [true, false, 503]]) {
      globalThis.fetch = async () => Response.json({ ok: database && auth, status: database && auth ? 'OK' : 'UNAVAILABLE', latencyMs: 58 });
      const response = await worker.fetch(new Request('https://autopilotgeo.com/api/public/health/cloud'));
      assert.equal(response.status, expected);
      assert.match(response.headers.get('Cache-Control'), /no-store/);
    }
  } finally { globalThis.fetch = original; }
});

test('Cloud monitor fails closed when upstream is unreachable', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.equal((await worker.fetch(new Request('https://autopilotgeo.com/api/public/health/cloud'))).status, 503);
  } finally { globalThis.fetch = original; }
});