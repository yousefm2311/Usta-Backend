const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const { createTestServer } = require('../test_support/http');

test('verification routes reject unauthenticated access', async () => {
  const server = await createTestServer(app);
  try {
    const status = await server.request('/api/verification/status');
    assert.equal(status.response.status, 401);

    const uploadId = await server.request('/api/verification/upload-id', {
      method: 'POST',
      body: '',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=----usta-test',
      },
    });
    assert.equal(uploadId.response.status, 401);

    const uploadSelfie = await server.request('/api/verification/upload-selfie', {
      method: 'POST',
      body: '',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=----usta-test',
      },
    });
    assert.equal(uploadSelfie.response.status, 401);
  } finally {
    await server.close();
  }
});
