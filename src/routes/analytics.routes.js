const express = require('express');
const { body, validationResult } = require('express-validator');
const ctrl = require('../controllers/analytics.controller');
const { auth } = require('../middlewares/auth');

const router = express.Router();

function ok(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation error', details: errors.array() });
  next();
}

router.get('/api/artisan/dashboard', auth('artisan'), (req, res, next) => ctrl.dashboard(req, res).catch(next));
router.get('/api/artisan/insights', auth('artisan'), (req, res, next) => ctrl.insights(req, res).catch(next));
router.get('/api/artisan/tips', auth('artisan'), (req, res, next) => ctrl.tips(req, res).catch(next));
router.get('/api/artisan/badges', auth('artisan'), (req, res, next) => ctrl.badges(req, res).catch(next));
router.post(
  '/api/artisan/self-eval',
  auth('artisan'),
  body('answers').isObject(),
  body('notes').optional().isString().isLength({ max: 500 }),
  ok,
  (req, res, next) => ctrl.selfEval(req, res).catch(next)
);

module.exports = router;
