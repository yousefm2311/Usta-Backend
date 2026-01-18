const express = require('express');
const { param, validationResult } = require('express-validator');
const notif = require('../../controllers/shared/notifications.controller');
const { adminAuth, requireRole } = require('../../middlewares/admin/adminAuth');

const router = express.Router();

function ok(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation error', details: errors.array() });
  next();
}

// Admin-only token lookup by user id (to avoid leaking tokens between users)
router.get('/api/notifications/customer/:id/tokens', adminAuth, requireRole('viewer', 'editor', 'super'), param('id').isLength({ min: 24, max: 24 }), ok, (req, res, next) => notif.listCustomerTokensById(req, res).catch(next));
router.get('/api/notifications/artisan/:id/tokens', adminAuth, requireRole('viewer', 'editor', 'super'), param('id').isLength({ min: 24, max: 24 }), ok, (req, res, next) => notif.listArtisanTokensById(req, res).catch(next));

module.exports = router;



