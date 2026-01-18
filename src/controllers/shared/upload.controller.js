const fs = require('fs');
const path = require('path');
const { dataResponse } = require('../../utils/shared/responder');

async function optimizeChatImage(file) {
  const inputPath = file.path;
  const ext = path.extname(file.filename || '');
  const base = path.basename(file.filename || '', ext);
  const outName = `${base}.webp`;
  const outPath = path.join(path.dirname(inputPath), outName);
  try {
    const sharp = require('sharp');
    await sharp(inputPath)
      .rotate()
      .resize({ width: 1280, height: 1280, fit: 'inside' })
      .toFormat('webp', { quality: 72 })
      .toFile(outPath);
    fs.unlinkSync(inputPath);
    return outName;
  } catch (_) {
    return file.filename;
  }
}

async function uploadChat(req, res) {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  let filename = req.file.filename;
  if ((req.file.mimetype || '').toLowerCase().startsWith('image/')) {
    filename = await optimizeChatImage(req.file);
  }
  const url = `/uploads/chat/${filename}`;
  return res.status(201).json(dataResponse({ url }));
}

module.exports = { uploadChat };


