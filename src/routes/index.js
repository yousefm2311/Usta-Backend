const express = require('express');

const artisanRoutes = require('./artisan/artisan.routes');
const customerRoutes = require('./customer/customer.routes');
const requestsRoutes = require('./shared/requests.routes');
const chatRoutes = require('./shared/chat.routes');
const analyticsRoutes = require('./artisan/analytics.routes');
const adminRoutes = require('./admin/admin.routes');
const notificationRoutes = require('./shared/notifications.routes');
const pushRoutes = require('./admin/push.routes');
const uploadRoutes = require('./shared/upload.routes');
const userRoutes = require('./artisan/user.routes');

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


