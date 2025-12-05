const express = require('express');
const { param, validationResult } = require('express-validator');
const notif = require('../controllers/notifications.controller');
const { authAny } = require('../middlewares/auth');

const router = express.Router();

function ok(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation error', details: errors.array() });
  next();
}

// Public (authAny) token lookup by user id for chat/notifications
router.get('/api/notifications/customer/:id/tokens', authAny, param('id').isLength({ min: 24, max: 24 }), ok, (req, res, next) => notif.listCustomerTokensById(req, res).catch(next));
router.get('/api/notifications/artisan/:id/tokens', authAny, param('id').isLength({ min: 24, max: 24 }), ok, (req, res, next) => notif.listArtisanTokensById(req, res).catch(next));

module.exports = router;
