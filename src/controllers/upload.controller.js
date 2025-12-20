const { dataResponse } = require('../utils/responder');

async function uploadChat(req, res) {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const url = `/uploads/chat/${req.file.filename}`;
  return res.status(201).json(dataResponse({ url }));
}

module.exports = { uploadChat };
