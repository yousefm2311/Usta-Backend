const Artisan = require('../../models/artisan.model');

function buildActiveArtisanFilter(filter = {}) {
  return {
    ...filter,
    deleted: { $ne: true },
  };
}

async function findVerificationOwner(filter, options = {}) {
  const query = Artisan.findOne(buildActiveArtisanFilter(filter));
  if (options.select) {
    query.select(options.select);
  }
  if (options.lean) {
    query.lean();
  }
  return query;
}

async function findVerificationOwnerById(artisanId, options = {}) {
  return findVerificationOwner({ _id: artisanId }, options);
}

async function updateVerificationOwner(artisanId, patch, options = {}) {
  const filter = buildActiveArtisanFilter({ _id: artisanId });
  if (options.expectedStatus) {
    filter.verificationStatus = options.expectedStatus;
  }
  const query = Artisan.findOneAndUpdate(
    filter,
    { $set: patch },
    {
      new: options.new !== false,
    },
  );
  if (options.select) {
    query.select(options.select);
  }
  if (options.lean) {
    query.lean();
  }
  return query;
}

async function listVerificationOwners(filter = {}, options = {}) {
  const query = Artisan.find(buildActiveArtisanFilter(filter));
  if (options.select) {
    query.select(options.select);
  }
  if (options.sort) {
    query.sort(options.sort);
  }
  if (Number.isFinite(options.skip)) {
    query.skip(options.skip);
  }
  if (Number.isFinite(options.limit)) {
    query.limit(options.limit);
  }
  if (options.lean) {
    query.lean();
  }
  return query;
}

async function countVerificationOwners(filter = {}) {
  return Artisan.countDocuments(buildActiveArtisanFilter(filter));
}

module.exports = {
  buildActiveArtisanFilter,
  findVerificationOwner,
  findVerificationOwnerById,
  updateVerificationOwner,
  listVerificationOwners,
  countVerificationOwners,
};
