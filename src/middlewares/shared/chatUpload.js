const fs = require('fs');
const path = require('path');
const multer = require('multer');

const MAX_CHAT_FILE_BYTES = 25 * 1024 * 1024; // 25MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'chat');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').replace(/[^.\w]/g, '') || '.bin';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  const mime = (file.mimetype || '').toLowerCase();
  if (mime.startsWith('image/') || mime.startsWith('audio/') || mime.startsWith('video/')) return cb(null, true);
  return cb(new Error('Unsupported file type'), false);
}

const uploadChatMedia = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_CHAT_FILE_BYTES },
});

module.exports = { uploadChatMedia, MAX_CHAT_FILE_BYTES };

