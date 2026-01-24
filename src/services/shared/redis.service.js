const { createClient } = require('redis');

let client;

function getRedisUrl() {
  return process.env.REDIS_URL || 'redis://127.0.0.1:6379';
}

async function getRedisClient() {
  try {
    if (!client) {
      client = createClient({ url: getRedisUrl() });
      client.on('error', (err) => {
        // Avoid crashing the app if Redis is down
        console.warn('Redis error:', err?.message || err);
      });
    }
    if (!client.isOpen) {
      await client.connect();
    }
    return client;
  } catch (err) {
    return null;
  }
}

async function cacheGet(key) {
  const c = await getRedisClient();
  if (!c) return null;
  try {
    return await c.get(key);
  } catch (err) {
    return null;
  }
}

async function cacheSet(key, value, ttlSeconds) {
  const c = await getRedisClient();
  if (!c) return false;
  try {
    await c.set(key, value, { EX: ttlSeconds });
    return true;
  } catch (err) {
    return false;
  }
}

async function cacheDel(key) {
  const c = await getRedisClient();
  if (!c) return 0;
  try {
    return await c.del(key);
  } catch (err) {
    return 0;
  }
}

async function cacheDelByPattern(pattern) {
  const c = await getRedisClient();
  if (!c) return 0;
  try {
    const keys = [];
    for await (const key of c.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      keys.push(key);
    }
    if (!keys.length) return 0;
    return await c.del(keys);
  } catch (err) {
    return 0;
  }
}

module.exports = {
  cacheGet,
  cacheSet,
  cacheDel,
  cacheDelByPattern,
};
