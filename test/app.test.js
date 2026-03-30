const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const { createTestServer } = require('../test_support/http');

test('GET /health returns ok payload', async () => {
  const server = await createTestServer(app);
  try {
    const { response, body } = await server.request('/health');
    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true });
  } finally {
    await server.close();
  }
});

test('unknown routes return structured 404 payload', async () => {
  const server = await createTestServer(app);
  try {
    const { response, body } = await server.request('/missing-route');
    assert.equal(response.status, 404);
    assert.equal(body.error, 'Not found');
    assert.equal(body.code, 404);
    assert.equal(body.path, '/missing-route');
    assert.equal(body.method, 'GET');
  } finally {
    await server.close();
  }
});

test('private uploads are blocked from public access', async () => {
  const server = await createTestServer(app);
  try {
    const { response, body } = await server.request('/uploads/private/verification/id/secret.webp');
    assert.equal(response.status, 403);
    assert.equal(body.message, 'Private uploads are not publicly accessible');
  } finally {
    await server.close();
  }
});
