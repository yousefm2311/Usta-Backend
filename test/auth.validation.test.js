const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const { createTestServer } = require('../test_support/http');

async function expectValidationError(server, path, payload) {
  const { response, body } = await server.request(path, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  assert.equal(response.status, 400);
  assert.equal(body.error, 'Validation error');
  assert.ok(Array.isArray(body.details));
  assert.match(
    JSON.stringify(body.details),
    /email or phone required/,
  );
}

test('customer auth endpoints reject requests with no email and no phone', async () => {
  const server = await createTestServer(app);
  try {
    await expectValidationError(server, '/api/customer/signup', {
      name: 'Test User',
      password: 'Password123',
    });
    await expectValidationError(server, '/api/customer/login', {
      password: 'Password123',
    });
    await expectValidationError(server, '/api/customer/verify', {
      code: '123456',
    });
    await expectValidationError(server, '/api/customer/forgot-password', {
      code: '123456',
      newPassword: 'Password123',
    });
    await expectValidationError(server, '/api/customer/resend-verification', {});
  } finally {
    await server.close();
  }
});

test('artisan auth endpoints reject requests with no email and no phone', async () => {
  const server = await createTestServer(app);
  try {
    await expectValidationError(server, '/api/artisan/signup', {
      name: 'Artisan User',
      profession: 'Plumber',
      password: 'Password123',
    });
    await expectValidationError(server, '/api/artisan/login', {
      password: 'Password123',
    });
    await expectValidationError(server, '/api/artisan/verify', {
      code: '123456',
    });
    await expectValidationError(server, '/api/artisan/forgot-password', {
      code: '123456',
      newPassword: 'Password123',
    });
    await expectValidationError(server, '/api/artisan/resend-verification', {});
  } finally {
    await server.close();
  }
});

test('refresh endpoints return 401 when refresh token is missing', async () => {
  const server = await createTestServer(app);
  try {
    const customer = await server.request('/api/customer/refresh-token', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(customer.response.status, 401);
    assert.equal(customer.body.message, 'Refresh token required');

    const artisan = await server.request('/api/artisan/refresh-token', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(artisan.response.status, 401);
    assert.equal(artisan.body.message, 'Refresh token required');
  } finally {
    await server.close();
  }
});
