const fs = require('fs');
const path = require('path');
const { ApiError } = require('../../errors/apiError');

const DEFAULT_ALLOWED_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

function decodeBase64Image(base64) {
  if (typeof base64 !== 'string' || !base64.trim()) {
    throw ApiError.badRequest('image required');
  }
  const match = base64.match(/^data:(.*?);base64,(.*)$/);
  const mime = (match ? match[1] : 'image/jpeg').toLowerCase();
  const payload = match ? match[2] : base64;
  const data = Buffer.from(payload, 'base64');
  if (!data.length) throw ApiError.badRequest('Invalid image data');
  return { data, mime };
}

function imageExtFromMime(mime) {
  const lower = String(mime || '').toLowerCase();
  if (lower.includes('png')) return 'png';
  if (lower.includes('webp')) return 'webp';
  return 'jpg';
}

function saveImageBuffer(dir, name, buffer, ext) {
  const uploads = path.join(process.cwd(), 'uploads', dir);
  fs.mkdirSync(uploads, { recursive: true });
  const file = path.join(uploads, `${name}.${ext}`);
  fs.writeFileSync(file, buffer);
  return `/uploads/${dir}/${path.basename(file)}`;
}

async function saveBase64Image(options) {
  const opts = options || {};
  const { base64, dir, name } = opts;
  const maxDim = opts.maxDim || 0;
  const quality = Number(opts.quality || 72);
  const maxBytes = Number(opts.maxBytes || 0);
  const withoutEnlargement = opts.withoutEnlargement !== false;
  const forceWebp = opts.forceWebp !== false;
  const allowedMimes = Array.isArray(opts.allowedMimes) && opts.allowedMimes.length
    ? opts.allowedMimes.map((m) => String(m).toLowerCase())
    : DEFAULT_ALLOWED_MIMES;

  if (!dir || !name) throw ApiError.badRequest('Invalid image target');

  const { data, mime } = decodeBase64Image(base64);
  if (allowedMimes && !allowedMimes.includes(mime)) {
    throw ApiError.badRequest('Unsupported image type');
  }
  if (maxBytes && data.length > maxBytes) {
    const maxMb = Math.ceil(maxBytes / (1024 * 1024));
    throw ApiError.badRequest(`Image too large. Max ${maxMb}MB`);
  }

  const ext = imageExtFromMime(mime);
  if (maxDim || forceWebp) {
    try {
      const sharp = require('sharp');
      let pipeline = sharp(data).rotate();
      if (maxDim) {
        pipeline = pipeline.resize({
          width: maxDim,
          height: maxDim,
          fit: 'inside',
          withoutEnlargement,
        });
      }
      if (forceWebp) {
        pipeline = pipeline.toFormat('webp', { quality });
      }
      const output = await pipeline.toBuffer();
      return saveImageBuffer(dir, name, output, forceWebp ? 'webp' : ext);
    } catch (err) {
      if (err?.code === 'MODULE_NOT_FOUND') {
        return saveImageBuffer(dir, name, data, ext);
      }
      if (err instanceof ApiError) throw err;
      throw ApiError.badRequest('Invalid image data');
    }
  }

  return saveImageBuffer(dir, name, data, ext);
}

module.exports = {
  decodeBase64Image,
  imageExtFromMime,
  saveImageBuffer,
  saveBase64Image,
};
