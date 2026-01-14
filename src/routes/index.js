const express = require('express');

const artisanRoutes = require('./artisan.routes');
const customerRoutes = require('./customer.routes');
const requestsRoutes = require('./requests.routes');
const chatRoutes = require('./chat.routes');
const analyticsRoutes = require('./analytics.routes');
const adminRoutes = require('./admin.routes');
const notificationRoutes = require('./notifications.routes');
const pushRoutes = require('./push.routes');
const uploadRoutes = require('./upload.routes');
const userRoutes = require('./userRoutes');

const router = express.Router();

// Health check
router.get('/health', (req, res) => res.json({ ok: true }));

// Simple routes only (Mongoose-based)
router.use(artisanRoutes);
router.use(customerRoutes);
router.use(requestsRoutes);
router.use(chatRoutes);
router.use(analyticsRoutes);
router.use(adminRoutes);
router.use(notificationRoutes);
router.use(pushRoutes);
router.use(uploadRoutes);
router.use(userRoutes);

module.exports = router;
