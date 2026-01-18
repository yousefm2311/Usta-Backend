const express = require('express');
const ctrl = require('../../controllers/artisan/user.controller');
const { auth } = require('../../middlewares/shared/auth');

const router = express.Router();

router.get('/api/users/profile-completion', auth('artisan'), (req, res, next) => ctrl.getProfileCompletion(req, res).catch(next));

module.exports = router;



