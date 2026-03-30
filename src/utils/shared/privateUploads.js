const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ApiError } = require('../../errors/apiError');
const { imageExtFromMime } = require('./images');

const DEFAULT_ALLOWED_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

function ensureSafeRelativePath(relativePath) {
  const normalized = path.normalize(String(relativePath || '')).replace(/^(\.\.(\/|\\|$))+/, '');
  if (!normalized || normalized.includes('..')) {
    throw ApiError.badRequest('Invalid storage path');
  }
  return normalized;
}

function toAbsoluteStoragePath(relativePath) {
  const safePath = ensureSafeRelativePath(relativePath);
  return path.join(process.cwd(), safePath);
}

function removeStoredFile(relativePath) {
  if (!relativePath) return;
  try {
    const cleaned = String(relativePath).replace(/^\//, '');
    const absolutePath = toAbsoluteStoragePath(cleaned);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  } catch (_) {
    // Cleanup is best effort; failures should not break the request.
  }
}

async function optimizeBuffer(buffer, mimeType, { maxDim = 1800, quality = 82 } = {}) {
  try {
    const sharp = require('sharp');
    return await sharp(buffer)
      .rotate()
      .resize({
        width: maxDim,
        height: maxDim,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality })
      .toBuffer();
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      return buffer;
    }
    throw ApiError.badRequest(`Invalid ${mimeType || 'image'} data`);
  }
}

async function savePrivateImage({
  buffer,
  mimeType,
  dir,
  filePrefix,
  allowedMimes = DEFAULT_ALLOWED_MIMES,
  maxDim = 1800,
  quality = 82,
}) {
  const normalizedMime = String(mimeType || '').toLowerCase();
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw ApiError.badRequest('Image file is required');
  }
  if (!normalizedMime || !allowedMimes.includes(normalizedMime)) {
    throw ApiError.badRequest('Unsupported image type');
  }
  const relativeDirectory = path.join('uploads', 'private', dir || '');
  const absoluteDirectory = toAbsoluteStoragePath(relativeDirectory);
  fs.mkdirSync(absoluteDirectory, { recursive: true });

  const optimizedBuffer = await optimizeBuffer(buffer, normalizedMime, {
    maxDim,
    quality,
  });
  const extension = optimizedBuffer === buffer
    ? imageExtFromMime(normalizedMime)
    : 'webp';
  const filename = `${filePrefix || 'upload'}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const relativePath = path.join(relativeDirectory, filename);
  const absolutePath = toAbsoluteStoragePath(relativePath);
  fs.writeFileSync(absolutePath, optimizedBuffer);
  return `/${relativePath.replace(/\\/g, '/')}`;
}

module.exports = {
  savePrivateImage,
  removeStoredFile,
  toAbsoluteStoragePath,
};
