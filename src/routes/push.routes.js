const express = require('express');
const { body, validationResult } = require('express-validator');
const { adminAuth, requireRole } = require('../middlewares/adminAuth');
const push = require('../controllers/push.controller');

const router = express.Router();

function ok(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation error', details: errors.array() });
  next();
}

// Send to device token
router.post(
  '/api/notifications/token',
  adminAuth,
  requireRole('editor', 'super'),
  body('token').isString().isLength({ min: 10 }),
  body('notification').isObject(),
  body('notification.title').isString().isLength({ min: 1 }),
  body('notification.body').isString().isLength({ min: 1 }),
  ok,
  (req, res, next) => push.sendToToken(req, res).catch(next),
);

// Send to topic
router.post(
  '/api/notifications/topic',
  adminAuth,
  requireRole('editor', 'super'),
  body('topic').isString().isLength({ min: 1 }),
  body('notification').isObject(),
  body('notification.title').isString().isLength({ min: 1 }),
  body('notification.body').isString().isLength({ min: 1 }),
  ok,
  (req, res, next) => push.sendToTopic(req, res).catch(next),
);

module.exports = router;
