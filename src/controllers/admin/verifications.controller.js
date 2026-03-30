const fs = require('fs');
const path = require('path');
const Artisan = require('../../models/artisan.model');
const { ApiError } = require('../../errors/apiError');
const { paginatedResponse, dataResponse } = require('../../utils/shared/responder');
const { getPagination } = require('../../utils/shared/pagination');
const { logActivity } = require('../../utils/shared/activityLogger');
const {
  VERIFICATION_STATUSES,
  getCurrentVerificationStatus,
  getReviewedByPayload,
  normalizeVerificationState,
  transitionVerificationStatus,
} = require('../../utils/artisan/kycState');
const { toAbsoluteStoragePath } = require('../../utils/shared/privateUploads');

const IMAGE_TYPE_TO_FIELD = {
  idFront: 'idFrontImage',
  idBack: 'idBackImage',
  selfie: 'selfieImage',
};

function sanitizeArtisan(artisan) {
  if (!artisan) return null;
  const plain = typeof artisan.toObject === 'function' ? artisan.toObject() : { ...artisan };
  delete plain.password;
  return plain;
}

function buildVerificationRecord(artisan) {
  return {
    artisan: sanitizeArtisan(artisan),
    verification: normalizeVerificationState(artisan),
  };
}

function contentTypeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function listVerifications(req, res) {
  const { page, perPage, skip } = getPagination(req, { defaultPerPage: 25 });
  const filters = { deleted: { $ne: true } };
  if (req.query.status) {
    filters.verificationStatus = req.query.status;
  } else {
    filters.verificationStatus = {
      $in: [
        VERIFICATION_STATUSES.documentsUploaded,
        VERIFICATION_STATUSES.selfieUploaded,
        VERIFICATION_STATUSES.underReview,
        VERIFICATION_STATUSES.approved,
        VERIFICATION_STATUSES.rejected,
      ],
    };
  }

  const [items, total] = await Promise.all([
    Artisan.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage)
      .select(
        'name email phone profession verificationStatus identityVerified verificationAttempts reviewedAt reviewedBy verificationConfidence rejectionReasonUserSafe createdAt',
      ),
    Artisan.countDocuments(filters),
  ]);

  return res.json(
    paginatedResponse(
      items.map((artisan) => buildVerificationRecord(artisan)),
      total,
      page,
      perPage,
    ),
  );
}

async function getVerification(req, res) {
  const artisan = await Artisan.findOne({
    _id: req.params.id,
    deleted: { $ne: true },
  });
  if (!artisan) throw ApiError.notFound('Verification record not found');
  return res.json(dataResponse(buildVerificationRecord(artisan)));
}

async function approveVerification(req, res) {
  const artisan = await Artisan.findOne({
    _id: req.params.id,
    deleted: { $ne: true },
  });
  if (!artisan) throw ApiError.notFound('Verification record not found');

  const before = sanitizeArtisan(artisan);
  const patch = transitionVerificationStatus(artisan, VERIFICATION_STATUSES.approved, {
    reviewedAt: new Date(),
    reviewedBy: getReviewedByPayload(req.admin),
    failureReason: null,
    rejectionReasonUserSafe: null,
    rejectionReasonInternal: null,
    checkedAt: artisan.verificationCheckedAt || new Date(),
    force: true,
  });
  const updated = await Artisan.findOneAndUpdate(
    { _id: artisan._id, deleted: { $ne: true } },
    { $set: patch },
    { new: true },
  );

  await logActivity({
    req,
    admin: req.admin,
    action: 'kyc_admin_approve',
    entity: 'artisan_verification',
    entityId: artisan._id,
    before,
    after: sanitizeArtisan(updated),
  });

  return res.json(dataResponse(buildVerificationRecord(updated)));
}

async function rejectVerification(req, res) {
  const artisan = await Artisan.findOne({
    _id: req.params.id,
    deleted: { $ne: true },
  });
  if (!artisan) throw ApiError.notFound('Verification record not found');

  const rejectionReasonUserSafe = String(
    req.body?.rejectionReasonUserSafe || 'تعذر التحقق من الهوية. يرجى إعادة رفع الصور.',
  ).trim();
  const rejectionReasonInternal = String(
    req.body?.rejectionReasonInternal || 'admin_rejected_verification',
  ).trim();
  const before = sanitizeArtisan(artisan);
  const patch = transitionVerificationStatus(artisan, VERIFICATION_STATUSES.rejected, {
    reviewedAt: new Date(),
    reviewedBy: getReviewedByPayload(req.admin),
    failureReason: rejectionReasonUserSafe,
    rejectionReasonUserSafe,
    rejectionReasonInternal,
    incrementAttempts: true,
    lastAttemptAt: new Date(),
    checkedAt: artisan.verificationCheckedAt || new Date(),
    force: true,
  });
  const updated = await Artisan.findOneAndUpdate(
    { _id: artisan._id, deleted: { $ne: true } },
    { $set: patch },
    { new: true },
  );

  await logActivity({
    req,
    admin: req.admin,
    action: 'kyc_admin_reject',
    entity: 'artisan_verification',
    entityId: artisan._id,
    before,
    after: sanitizeArtisan(updated),
  });

  return res.json(dataResponse(buildVerificationRecord(updated)));
}

async function streamVerificationImage(req, res) {
  const field = IMAGE_TYPE_TO_FIELD[req.params.type];
  if (!field) throw ApiError.badRequest('Invalid image type');

  const artisan = await Artisan.findOne({
    _id: req.params.id,
    deleted: { $ne: true },
  }).select('idFrontImage idBackImage selfieImage verificationStatus');
  if (!artisan) throw ApiError.notFound('Verification record not found');

  const relativePath = artisan[field];
  if (!relativePath) {
    throw ApiError.notFound('Verification image not found');
  }

  const absolutePath = toAbsoluteStoragePath(String(relativePath).replace(/^\//, ''));
  if (!fs.existsSync(absolutePath)) {
    throw ApiError.notFound('Stored verification image not found');
  }

  await logActivity({
    req,
    admin: req.admin,
    action: 'kyc_admin_stream_image',
    entity: 'artisan_verification',
    entityId: artisan._id,
    after: {
      imageType: req.params.type,
      verificationStatus: getCurrentVerificationStatus(artisan),
    },
  });

  res.setHeader('Content-Type', contentTypeFromPath(absolutePath));
  res.setHeader('Cache-Control', 'no-store');
  return fs.createReadStream(absolutePath).pipe(res);
}

module.exports = {
  listVerifications,
  getVerification,
  approveVerification,
  rejectVerification,
  streamVerificationImage,
};
