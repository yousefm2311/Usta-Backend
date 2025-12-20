const express = require('express');
const { uploadChatMedia } = require('../middlewares/chatUpload');
const { uploadChat } = require('../controllers/upload.controller');
const { authAny } = require('../middlewares/auth');

const router = express.Router();

router.post('/api/upload/chat', authAny, uploadChatMedia.single('file'), uploadChat);

module.exports = router;
