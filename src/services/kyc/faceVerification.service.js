const fs = require('fs');
const { RekognitionClient, CompareFacesCommand, DetectFacesCommand } = require('@aws-sdk/client-rekognition');
const { ApiError } = require('../../errors/apiError');
const { toAbsoluteStoragePath } = require('../../utils/shared/privateUploads');
const {
  KYC_REJECTION_CATEGORIES,
  getUserSafeRejectionMessage,
} = require('../../utils/artisan/kycRejection');

const REJECT_THRESHOLD = Number(process.env.KYC_FACE_REJECT_THRESHOLD) || 60;
const REVIEW_THRESHOLD = Number(process.env.KYC_FACE_REVIEW_THRESHOLD) || 85;

function isAutoApproveHighConfidenceEnabled() {
  return !/^(0|false|no)$/i.test(
    String(process.env.KYC_AUTO_APPROVE_HIGH_CONFIDENCE || 'true'),
  );
}

function providerMode() {
  const raw = String(process.env.KYC_PROVIDER || '').trim().toLowerCase();
  if (raw) return raw;
  const hasAwsConfig = Boolean(process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION);
  if (hasAwsConfig) return 'aws';
  if (process.env.NODE_ENV !== 'production') return 'mock';
  return 'aws';
}

function readImageBytes(relativePath) {
  if (!relativePath) {
    throw ApiError.badRequest('Missing verification image');
  }
  const absolutePath = toAbsoluteStoragePath(String(relativePath).replace(/^\//, ''));
  if (!fs.existsSync(absolutePath)) {
    throw ApiError.badRequest('Stored verification image was not found');
  }
  return fs.readFileSync(absolutePath);
}

let awsClient;
function getAwsClient() {
  if (awsClient) return awsClient;
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!region) {
    throw new ApiError(500, 'AWS Rekognition is not configured. Missing AWS_REGION.');
  }
  awsClient = new RekognitionClient({ region });
  return awsClient;
}

async function detectSingleFace(client, bytes, label) {
  const response = await client.send(new DetectFacesCommand({
    Image: { Bytes: bytes },
    Attributes: ['DEFAULT'],
  }));
  const count = Array.isArray(response?.FaceDetails) ? response.FaceDetails.length : 0;
  return { detected: count >= 1, count };
}

function classifyConfidence(confidence) {
  const normalized = Number(confidence) || 0;
  if (normalized < REJECT_THRESHOLD) {
    return {
      status: 'rejected',
      rejectionCategory: KYC_REJECTION_CATEGORIES.faceMismatch,
      userSafeReason: getUserSafeRejectionMessage(
        KYC_REJECTION_CATEGORIES.faceMismatch,
      ),
      internalReason: `face_mismatch_low_confidence:${normalized.toFixed(2)}`,
    };
  }
  if (normalized <= REVIEW_THRESHOLD) {
    return {
      status: 'under_review',
      rejectionCategory: null,
      userSafeReason: 'الصور تحتاج مراجعة إضافية قبل التفعيل.',
      internalReason: `face_match_manual_review:${normalized.toFixed(2)}`,
    };
  }
  return {
    status: isAutoApproveHighConfidenceEnabled() ? 'approved' : 'under_review',
    rejectionCategory: null,
    userSafeReason: null,
    internalReason: isAutoApproveHighConfidenceEnabled()
      ? `face_match_auto_approved:${normalized.toFixed(2)}`
      : `face_match_manual_review_high_confidence:${normalized.toFixed(2)}`,
  };
}

async function compareWithAws({ idImagePath, selfieImagePath }) {
  const client = getAwsClient();
  const idBytes = readImageBytes(idImagePath);
  const selfieBytes = readImageBytes(selfieImagePath);

  const idFace = await detectSingleFace(client, idBytes, 'the ID image');
  if (!idFace.detected) {
    return {
      confidence: 0,
      provider: 'aws-rekognition',
      finalStatus: 'rejected',
      matched: false,
      rejectionCategory: KYC_REJECTION_CATEGORIES.idBlurry,
      userSafeReason: getUserSafeRejectionMessage(
        KYC_REJECTION_CATEGORIES.idBlurry,
      ),
      internalReason: 'document_face_not_detected',
    };
  }
  const selfieFace = await detectSingleFace(client, selfieBytes, 'the selfie');
  if (!selfieFace.detected) {
    return {
      confidence: 0,
      provider: 'aws-rekognition',
      finalStatus: 'rejected',
      matched: false,
      rejectionCategory: KYC_REJECTION_CATEGORIES.faceNotClear,
      userSafeReason: getUserSafeRejectionMessage(
        KYC_REJECTION_CATEGORIES.faceNotClear,
      ),
      internalReason: 'selfie_face_not_detected',
    };
  }

  const response = await client.send(new CompareFacesCommand({
    SimilarityThreshold: 0,
    SourceImage: { Bytes: idBytes },
    TargetImage: { Bytes: selfieBytes },
  }));

  const matches = Array.isArray(response?.FaceMatches) ? response.FaceMatches : [];
  const bestMatch = matches.reduce((current, item) => {
    if (!current) return item;
    return (item?.Similarity || 0) > (current?.Similarity || 0) ? item : current;
  }, null);
  const confidence = Number(bestMatch?.Similarity || 0);
  const classification = classifyConfidence(confidence);
  return {
    confidence,
    provider: 'aws-rekognition',
    finalStatus: classification.status,
    matched: classification.status === 'approved',
    rejectionCategory: classification.rejectionCategory,
    userSafeReason: classification.userSafeReason,
    internalReason: classification.internalReason,
  };
}

function compareWithMock() {
  const mode = String(process.env.KYC_MOCK_RESULT || 'match').trim().toLowerCase();
  if (mode === 'error') {
    throw new ApiError(500, 'KYC mock provider forced an error');
  }
  if (mode === 'review' || mode === 'under_review') {
    const confidence = Math.max(REJECT_THRESHOLD + 2, REVIEW_THRESHOLD - 5);
    const classification = classifyConfidence(confidence);
    return {
      confidence,
      provider: 'mock',
      finalStatus: classification.status,
      matched: classification.status === 'approved',
      rejectionCategory: classification.rejectionCategory,
      userSafeReason: classification.userSafeReason,
      internalReason: classification.internalReason,
    };
  }
  if (mode === 'fail' || mode === 'mismatch') {
    const confidence = Math.max(0, REJECT_THRESHOLD - 10);
    const classification = classifyConfidence(confidence);
    return {
      matched: false,
      confidence,
      provider: 'mock',
      finalStatus: classification.status,
      rejectionCategory: classification.rejectionCategory,
      userSafeReason: classification.userSafeReason,
      internalReason: classification.internalReason,
    };
  }
  const confidence = Math.min(99, REVIEW_THRESHOLD + 5);
  const classification = classifyConfidence(confidence);
  return {
    matched: classification.status === 'approved',
    confidence,
    provider: 'mock',
    finalStatus: classification.status,
    rejectionCategory: classification.rejectionCategory,
    userSafeReason: classification.userSafeReason,
    internalReason: classification.internalReason,
  };
}

async function verifyArtisanIdentity({ idImagePath, selfieImagePath }) {
  const mode = providerMode();
  if (mode === 'mock') {
    return compareWithMock();
  }
  if (mode !== 'aws') {
    throw new ApiError(500, `Unsupported KYC provider: ${mode}`);
  }
  return compareWithAws({ idImagePath, selfieImagePath });
}

module.exports = {
  REJECT_THRESHOLD,
  REVIEW_THRESHOLD,
  isAutoApproveHighConfidenceEnabled,
  classifyConfidence,
  verifyArtisanIdentity,
};
