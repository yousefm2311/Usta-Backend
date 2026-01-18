const express = require('express');
const { uploadChatMedia } = require('../../middlewares/shared/chatUpload');
const { uploadChat } = require('../../controllers/shared/upload.controller');
const { authAny } = require('../../middlewares/shared/auth');

const router = express.Router();

router.post('/api/upload/chat', authAny, uploadChatMedia.single('file'), uploadChat);

module.exports = router;



