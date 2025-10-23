const express = require('express');
const ctrl = require('../controllers/analytics.controller');
const { auth } = require('../middlewares/auth');

const router = express.Router();

router.get('/api/artisan/dashboard', auth('artisan'), (req, res, next) => ctrl.dashboard(req, res).catch(next));
router.get('/api/artisan/insights', auth('artisan'), (req, res, next) => ctrl.insights(req, res).catch(next));

module.exports = router;

