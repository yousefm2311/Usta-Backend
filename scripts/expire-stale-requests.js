require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config');
const requestService = require('../src/services/requests/request.service');

async function main() {
  const uri = process.env.MONGODB_URI || config.mongodbUri;
  const dbName = process.env.DB_NAME || config.dbName;
  await mongoose.connect(uri, { dbName });

  const opts = {};
  const limitArg = process.argv[2];
  if (limitArg !== undefined) {
    const parsed = Number(limitArg);
    if (Number.isNaN(parsed) || parsed <= 0) throw new Error('limit must be a positive number');
    opts.limit = parsed;
  }
  const beforeArg = process.argv[3];
  if (beforeArg) {
    const parsed = new Date(beforeArg);
    if (Number.isNaN(parsed.getTime())) throw new Error('before must be a valid date');
    opts.now = parsed;
  }

  const expired = await requestService.expireStaleRequests(opts);
  console.log(`Expired ${expired.length} request(s).`);
  const autoConfirmed = await requestService.autoConfirmAwaitingCompletion(opts);
  console.log(`Auto-confirmed ${autoConfirmed.length} request(s).`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('expire-stale-requests failed', err);
  mongoose.disconnect().finally(() => process.exit(1));
});

