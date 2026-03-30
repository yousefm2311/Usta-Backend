const multer = require('multer');
const { ApiError } = require('../../errors/apiError');

const MAX_VERIFICATION_FILE_BYTES = Number(process.env.KYC_MAX_FILE_BYTES) || 6 * 1024 * 1024;
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VERIFICATION_FILE_BYTES, files: 2 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIMES.has(String(file.mimetype || '').toLowerCase())) {
      return cb(ApiError.badRequest('Only JPG, PNG, or WEBP images are allowed'));
    }
    return cb(null, true);
  },
});

function handleVerificationUploadError(err, req, res, next) {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(ApiError.badRequest('Image too large. Max 6MB'));
    }
    return next(ApiError.badRequest(err.message));
  }
  return next(err);
}

module.exports = {
  uploadVerificationIdImages: upload.fields([
    { name: 'idFront', maxCount: 1 },
    { name: 'idBack', maxCount: 1 },
  ]),
  uploadVerificationSelfie: upload.single('selfie'),
  handleVerificationUploadError,
  MAX_VERIFICATION_FILE_BYTES,
};
