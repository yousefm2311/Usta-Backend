const Request = require('../models/request.model');
const Review = require('../models/review.model');
const Notification = require('../models/notification.model');

async function dashboard(req, res) {
  const [activeRequests, myReviews, unreadNotifications] = await Promise.all([
    Request.countDocuments({ customerId: req.user._id, status: { $nin: ['completed', 'cancelled', 'rejected'] } }),
    Review.countDocuments({ customerId: req.user._id }),
    Notification.countDocuments({ customerId: req.user._id, read: { $ne: true } }),
  ]);
  return res.json({ activeRequests, myReviews, unreadNotifications });
}

async function stats(req, res) {
  const monthly = await Request.aggregate([
    { $match: { customerId: req.user._id } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, total: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return res.json({ monthlyRequests: monthly });
}

module.exports = { dashboard, stats };

