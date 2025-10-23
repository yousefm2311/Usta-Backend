const Request = require('../models/request.model');
const Review = require('../models/review.model');
const Transaction = require('../models/transaction.model');

// GET /api/artisan/dashboard
async function dashboard(req, res) {
  const artisanId = req.user._id;
  const [activeCount, completedCountAgg, ratingAgg, monthlyAgg] = await Promise.all([
    Request.countDocuments({ artisanId, status: { $in: ['accepted', 'in_progress'] } }),
    Request.aggregate([{ $match: { artisanId, status: 'completed' } }, { $group: { _id: null, count: { $sum: 1 } } }]),
    Review.aggregate([{ $match: { artisanId } }, { $group: { _id: null, avg: { $avg: '$rating' } } }]),
    Transaction.aggregate([
      { $match: { artisanId, credit: { $gt: 0 } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, total: { $sum: '$credit' } } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  const completedRequests = completedCountAgg[0]?.count || 0;
  const averageRating = Number(((ratingAgg[0]?.avg || 0).toFixed?.(2) || 0));
  return res.json({ activeRequests: activeCount, completedRequests, averageRating, monthlyEarnings: monthlyAgg });
}

// GET /api/artisan/insights
async function insights(req, res) {
  const artisan = req.user;
  const tips = [];
  if (!artisan?.portfolio?.length) tips.push('أضف أعمالك السابقة لزيادة الثقة');
  if (!artisan?.pricing?.length) tips.push('أضف نطاق أسعار واضح لخدماتك');
  if (!artisan?.verified) tips.push('قم بتفعيل الحساب لتحسين ترتيب الظهور');
  return res.json({ tips });
}

module.exports = { dashboard, insights };

