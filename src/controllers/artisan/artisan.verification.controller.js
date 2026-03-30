const Artisan = require('../../models/artisan.model');
const { ApiError } = require('../../errors/apiError');
const { savePrivateImage, removeStoredFile } = require('../../utils/shared/privateUploads');
const { logActivity } = require('../../utils/shared/activityLogger');
const {
  VERIFICATION_STATUSES,
  assertCanAttemptVerification,
  normalizeVerificationState,
  transitionVerificationStatus,
} = require('../../utils/artisan/kycState');
const { verifyArtisanIdentity } = require('../../services/kyc/faceVerification.service');

function buildVerificationResponse(artisan) {
  return normalizeVerificationState(artisan);
}

function sanitizeArtisan(artisan) {
  if (!artisan) return null;
  const plain = typeof artisan.toObject === 'function' ? artisan.toObject() : { ...artisan };
  delete plain.password;
  return plain;
}

function getNamedFile(req, fieldName) {
  if (req.file && req.file.fieldname === fieldName) return req.file;
  if (req.files && Array.isArray(req.files[fieldName]) && req.files[fieldName][0]) {
    return req.files[fieldName][0];
  }
  return null;
}

async function logBlockedAttempt(req, artisan, error) {
  await logActivity({
    req,
    user: artisan,
    action: 'kyc_attempt_blocked',
    entity: 'artisan_verification',
    entityId: artisan?._id,
    after: {
      reason: error?.message,
      details: error?.details || null,
    },
  });
}

async function assertCanProceed(req, artisan) {
  try {
    return assertCanAttemptVerification(artisan);
  } catch (error) {
    await logBlockedAttempt(req, artisan, error);
    throw error;
  }
}

async function updateArtisanVerification(req, artisan, patch) {
  const updated = await Artisan.findOneAndUpdate(
    { _id: artisan._id, deleted: { $ne: true } },
    { $set: patch },
    { new: true },
  );
  if (!updated) {
    throw ApiError.notFound('Artisan account not found');
  }
  Object.assign(artisan, updated.toObject());
  return updated;
}

async function cleanupFiles(paths) {
  for (const filePath of paths.filter(Boolean)) {
    removeStoredFile(filePath);
  }
}

async function uploadId(req, res) {
  const artisan = req.user;
  await assertCanProceed(req, artisan);

  const idFront = getNamedFile(req, 'idFront');
  const idBack = getNamedFile(req, 'idBack');
  if (!idFront || !idBack) {
    throw ApiError.badRequest('Both idFront and idBack images are required');
  }

  const previousFront = artisan.idFrontImage;
  const previousBack = artisan.idBackImage;
  const previousSelfie = artisan.selfieImage;
  const previousStatus = artisan.verificationStatus;

  let idFrontImage;
  let idBackImage;
  try {
    [idFrontImage, idBackImage] = await Promise.all([
      savePrivateImage({
        buffer: idFront.buffer,
        mimeType: idFront.mimetype,
        dir: 'verification/id',
        filePrefix: `${artisan._id}-id-front`,
      }),
      savePrivateImage({
        buffer: idBack.buffer,
        mimeType: idBack.mimetype,
        dir: 'verification/id',
        filePrefix: `${artisan._id}-id-back`,
      }),
    ]);

    const nextState = {
      ...transitionVerificationStatus(artisan, VERIFICATION_STATUSES.documentsUploaded, {
        idFrontImage,
        idBackImage,
        selfieImage: null,
        confidence: null,
        checkedAt: null,
        reviewedAt: null,
        reviewedBy: null,
        failureReason: null,
        rejectionReasonUserSafe: null,
        rejectionReasonInternal: null,
      }),
    };

    const updated = await updateArtisanVerification(req, artisan, nextState);
    await cleanupFiles([previousFront, previousBack, previousSelfie]);
    await logActivity({
      req,
      user: artisan,
      action: 'kyc_upload_id',
      entity: 'artisan_verification',
      entityId: artisan._id,
      before: {
        verificationStatus: previousStatus,
      },
      after: {
        verificationStatus: updated.verificationStatus,
      },
    });
  } catch (error) {
    await cleanupFiles([idFrontImage, idBackImage]);
    throw error;
  }

  return res.status(201).json({
    message: 'ID images uploaded successfully',
    verification: buildVerificationResponse(artisan),
    artisan: sanitizeArtisan(artisan),
  });
}

async function uploadSelfie(req, res) {
  const artisan = req.user;
  await assertCanProceed(req, artisan);

  if (!artisan.idFrontImage || !artisan.idBackImage) {
    throw ApiError.badRequest('Upload ID images before uploading a selfie');
  }

  const selfie = getNamedFile(req, 'selfie');
  if (!selfie) {
    throw ApiError.badRequest('selfie image is required');
  }

  const previousStatus = artisan.verificationStatus;
  const previousSelfie = artisan.selfieImage;
  let selfieImage;
  try {
    selfieImage = await savePrivateImage({
      buffer: selfie.buffer,
      mimeType: selfie.mimetype,
      dir: 'verification/selfie',
      filePrefix: `${artisan._id}-selfie`,
    });

    const selfieUploadedPatch = transitionVerificationStatus(
      artisan,
      VERIFICATION_STATUSES.selfieUploaded,
      {
        selfieImage,
        reviewedAt: null,
        reviewedBy: null,
        rejectionReasonUserSafe: null,
        rejectionReasonInternal: null,
        failureReason: null,
      },
    );
    await updateArtisanVerification(req, artisan, selfieUploadedPatch);
    await logActivity({
      req,
      user: artisan,
      action: 'kyc_upload_selfie',
      entity: 'artisan_verification',
      entityId: artisan._id,
      before: {
        verificationStatus: previousStatus,
      },
      after: {
        verificationStatus: artisan.verificationStatus,
      },
    });

    const verificationResult = await verifyArtisanIdentity({
      idImagePath: artisan.idFrontImage,
      selfieImagePath: selfieImage,
    });

    const finalStatus = verificationResult.finalStatus || VERIFICATION_STATUSES.rejected;
    const shouldCountAttempt = finalStatus === VERIFICATION_STATUSES.rejected;
    const finalPatch = transitionVerificationStatus(
      artisan,
      finalStatus,
      {
        selfieImage,
        confidence: verificationResult.confidence,
        checkedAt: new Date(),
        failureReason: verificationResult.userSafeReason,
        rejectionReasonUserSafe: finalStatus === VERIFICATION_STATUSES.rejected
          ? verificationResult.userSafeReason
          : null,
        rejectionReasonInternal: finalStatus === VERIFICATION_STATUSES.rejected
          ? verificationResult.internalReason
          : null,
        incrementAttempts: shouldCountAttempt,
        lastAttemptAt: shouldCountAttempt ? new Date() : undefined,
      },
    );
    const updated = await updateArtisanVerification(req, artisan, finalPatch);
    await cleanupFiles([previousSelfie]);
    await logActivity({
      req,
      user: artisan,
      action: 'kyc_face_match_result',
      entity: 'artisan_verification',
      entityId: artisan._id,
      before: {
        verificationStatus: previousStatus,
      },
      after: {
        verificationStatus: updated.verificationStatus,
        confidence: verificationResult.confidence,
        provider: verificationResult.provider,
        attempts: updated.verificationAttempts,
      },
    });
    return res.status(200).json({
      message: updated.identityVerified
        ? 'Identity verified successfully'
        : updated.verificationStatus === VERIFICATION_STATUSES.underReview
          ? 'Verification is under review'
          : 'Identity verification failed. Please retry.',
      verification: buildVerificationResponse(updated),
      artisan: sanitizeArtisan(updated),
    });
  } catch (error) {
    if (selfieImage) {
      await cleanupFiles([selfieImage]);
    }
    if (artisan.selfieImage === selfieImage) {
      const revertPatch = transitionVerificationStatus(
        artisan,
        VERIFICATION_STATUSES.documentsUploaded,
        {
          selfieImage: previousSelfie || null,
        },
      );
      await updateArtisanVerification(req, artisan, revertPatch);
    }
    await logActivity({
      req,
      user: artisan,
      action: 'kyc_selfie_upload_failed',
      entity: 'artisan_verification',
      entityId: artisan._id,
      after: {
        message: error?.message,
      },
    });
    throw error;
  }
}

async function getStatus(req, res) {
  return res.json({
    verification: buildVerificationResponse(req.user),
    artisan: sanitizeArtisan(req.user),
  });
}

module.exports = {
  uploadId,
  uploadSelfie,
  getStatus,
};
