const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildEmailPhoneLookup,
  normalizeIdentity,
  requireEmailOrPhone,
} = require('../src/utils/shared/contactIdentity');

test('normalizeIdentity trims values and ignores blanks', () => {
  assert.equal(normalizeIdentity('  test@example.com  '), 'test@example.com');
  assert.equal(normalizeIdentity('   '), null);
  assert.equal(normalizeIdentity(undefined), null);
});

test('requireEmailOrPhone rejects empty identity payloads', () => {
  assert.throws(
    () => requireEmailOrPhone({}),
    /email or phone required/,
  );
});

test('buildEmailPhoneLookup creates a safe $or query', () => {
  assert.deepEqual(buildEmailPhoneLookup({ email: 'a@b.com' }), {
    $or: [{ email: 'a@b.com' }],
  });
  assert.deepEqual(buildEmailPhoneLookup({ phone: '0100' }), {
    $or: [{ phone: '0100' }],
  });
  assert.deepEqual(
    buildEmailPhoneLookup({ email: 'a@b.com', phone: '0100' }),
    { $or: [{ phone: '0100' }, { email: 'a@b.com' }] },
  );
});
