const express = require('express');
const { body, param, validationResult } = require('express-validator');
const ctrl = require('../controllers/chat.controller');
const { authAny } = require('../middlewares/auth');

const router = express.Router();

function ok(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation error', details: errors.array() });
  next();
}

router.post('/api/chat/:requestId', authAny, param('requestId').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.openChat(req, res).catch(next));
router.get('/api/chat/:requestId', authAny, param('requestId').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.getMessages(req, res).catch(next));
router.post(
  '/api/chat/message',
  authAny,
  body('requestId').isLength({ min: 24, max: 24 }),
  body('type').isIn(['text', 'image', 'audio']),
  ok,
  (req, res, next) => ctrl.postMessage(req, res).catch(next)
);
router.put('/api/chat/read/:messageId', authAny, param('messageId').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.markRead(req, res).catch(next));

// List chats
router.get('/api/chat', authAny, (req, res, next) => ctrl.listChats(req, res).catch(next));
router.get('/api/chat/direct/inbox', authAny, (req, res, next) => ctrl.getDirectInbox(req, res).catch(next));

// Direct chat (request-less for customer; artisan only after customer has a request)
router.get('/api/chat/direct/:otherId', authAny, param('otherId').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.getDirectMessages(req, res).catch(next));
router.post(
  '/api/chat/direct/message',
  authAny,
  body('otherId').isLength({ min: 24, max: 24 }),
  body('message').isString().isLength({ min: 1 }),
  ok,
  (req, res, next) => ctrl.postDirectMessage(req, res).catch(next)
);
router.put('/api/chat/direct/read/:messageId', authAny, param('messageId').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.markDirectRead(req, res).catch(next));
router.post('/api/chat/block', authAny, body('otherId').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.blockChat(req, res).catch(next));
router.post('/api/chat/unblock', authAny, body('otherId').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.unblockChat(req, res).catch(next));

module.exports = router;
