const express = require('express');
const { body, validationResult } = require('express-validator');
const { adminAuth, requireRole } = require('../../middlewares/admin/adminAuth');
const push = require('../../controllers/admin/push.controller');

const router = express.Router();

function ok(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, error: 'Validation error', details: errors.array() });
  next();
}

// Send to audience (all/segment/selected)
router.post(
  '/api/notifications/broadcast',
  adminAuth,
  requireRole('editor', 'super'),
  body('audience').isIn(['all', 'segment', 'customers', 'artisans', 'admins', 'selected']),
  body('topic').optional().isString().matches(/^[a-z0-9_]+$/),
  body('customerIds').optional().isArray(),
  body('artisanIds').optional().isArray(),
  body('adminIds').optional().isArray(),
  body('title').isString().isLength({ min: 1 }),
  body('body').isString().isLength({ min: 1 }),
  body().custom((_, { req }) => {
    if (req.body.audience === 'segment' && !req.body.topic) throw new Error('topic required for segment');
    if (req.body.audience === 'segment' && req.body.topic && !String(req.body.topic).startsWith('seg_')) {
      throw new Error('segment topic must start with seg_');
    }
    if (req.body.audience === 'selected') {
      const hasIds = Array.isArray(req.body.customerIds) || Array.isArray(req.body.artisanIds) || Array.isArray(req.body.adminIds);
      if (!hasIds) throw new Error('customerIds or artisanIds or adminIds required');
    }
    return true;
  }),
  ok,
  (req, res, next) => push.sendToAudience(req, res).catch(next),
);

module.exports = router;



