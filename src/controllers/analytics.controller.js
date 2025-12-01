const Request = require('../models/request.model');
const Review = require('../models/review.model');
const Transaction = require('../models/transaction.model');
const Artisan = require('../models/artisan.model');
const { ApiError } = require('../errors/apiError');

async function collectStats(artisanId) {
  const [completedCount, reviewAgg, earningAgg] = await Promise.all([
    Request.countDocuments({ artisanId, status: 'completed' }),
    Review.aggregate([
      { $match: { artisanId } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]),
    Transaction.aggregate([
      { $match: { artisanId, credit: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$credit' } } },
    ]),
  ]);

  const averageRating = Number(((reviewAgg[0]?.avg || 0).toFixed?.(2) || 0));
  const reviewCount = reviewAgg[0]?.count || 0;
  const totalEarnings = earningAgg[0]?.total || 0;

  return {
    completedRequests: completedCount,
    averageRating,
    reviewCount,
    totalEarnings,
  };
}

function buildTips(artisan, stats) {
  const tips = [];
  const portfolioCount = artisan?.portfolio?.length || 0;
  const pricingCount = artisan?.pricing?.length || 0;
  const availabilityCount = artisan?.availabilitySlots?.length || 0;

  if (!portfolioCount) tips.push('Add portfolio photos to build trust');
  if (!pricingCount) tips.push('Set clear pricing to appear in filtered searches');
  if (!artisan?.verified) tips.push('Verify your account to rank higher in results');
  if (stats.reviewCount < 3) tips.push('Ask customers to leave reviews after each job');
  if (stats.averageRating < 4.5 && stats.reviewCount >= 3) tips.push('Watch ratings and improve customer experience to raise your average');
  if (!availabilityCount) tips.push('Set availability slots to manage your time');
  if (!artisan?.paymentMethod?.type) tips.push('Add a payout method to receive withdrawals faster');
  if (!artisan?.pricing?.length && stats.completedRequests < 3) tips.push('Publish price packages early to increase acceptance rate');

  return tips;
}

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
  const stats = await collectStats(req.user._id);
  const tips = buildTips(req.user, stats);
  return res.json({ tips });
}

// GET /api/artisan/tips
async function tips(req, res) {
  const stats = await collectStats(req.user._id);
  const data = buildTips(req.user, stats);
  return res.json({ tips: data });
}

// GET /api/artisan/badges
async function badges(req, res) {
  const artisan = req.user;
  const stats = await collectStats(artisan._id);
  const portfolioCount = artisan?.portfolio?.length || 0;
  const pricingCount = artisan?.pricing?.length || 0;
  const availabilityCount = artisan?.availabilitySlots?.length || 0;

  const badges = [
    {
      key: 'verified',
      title: 'Verified account',
      description: 'Approved by the admin team',
      unlocked: !!artisan.verified,
      progress: { current: artisan.verified ? 1 : 0, target: 1 },
    },
    {
      key: 'starter',
      title: 'First completed request',
      description: 'Finished your first customer job',
      unlocked: stats.completedRequests >= 1,
      progress: { current: stats.completedRequests, target: 1 },
    },
    {
      key: 'closer',
      title: '10 completed requests',
      description: 'Consistently closing jobs',
      unlocked: stats.completedRequests >= 10,
      progress: { current: stats.completedRequests, target: 10 },
    },
    {
      key: 'quality',
      title: 'Excellent rating',
      description: 'Average rating 4.5+ with at least 5 reviews',
      unlocked: stats.averageRating >= 4.5 && stats.reviewCount >= 5,
      progress: { current: stats.averageRating, target: 4.5, reviews: stats.reviewCount },
    },
    {
      key: 'portfolio',
      title: 'Portfolio ready',
      description: 'Added 3 or more work samples',
      unlocked: portfolioCount >= 3,
      progress: { current: portfolioCount, target: 3 },
    },
    {
      key: 'pricing',
      title: 'Pricing ready',
      description: 'Published at least one price package or range',
      unlocked: pricingCount >= 1,
      progress: { current: pricingCount, target: 1 },
    },
    {
      key: 'availability',
      title: 'Availability set',
      description: 'Configured 3 or more availability slots',
      unlocked: availabilityCount >= 3,
      progress: { current: availabilityCount, target: 3 },
    },
    {
      key: 'earning',
      title: 'Earner',
      description: 'Total earnings reached 5000',
      unlocked: stats.totalEarnings >= 5000,
      progress: { current: stats.totalEarnings, target: 5000, currency: 'EGP' },
    },
  ];

  return res.json({ badges, summary: stats });
}

// POST /api/artisan/self-eval
async function selfEval(req, res) {
  const { answers, notes } = req.body || {};
  if (!answers || typeof answers !== 'object' || Array.isArray(answers) || !Object.keys(answers).length) {
    throw ApiError.badRequest('answers must be a non-empty object');
  }

  const normalized = {};
  const values = [];
  for (const [key, value] of Object.entries(answers)) {
    const num = Number(value);
    if (Number.isFinite(num)) {
      const bounded = Math.max(1, Math.min(5, num));
      normalized[key] = bounded;
      values.push(bounded);
    }
  }

  if (!values.length) throw ApiError.badRequest('answers must contain numeric scores between 1-5');

  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const score = Math.round((avg / 5) * 100); // convert to percentage
  const level = score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'needs-improvement';

  const stats = await collectStats(req.user._id);
  const recommendations = buildTips(req.user, stats);
  if (level === 'needs-improvement' && !recommendations.length) {
    recommendations.push('Review your answers and plan how to improve weak areas.');
  }

  await Artisan.updateOne(
    { _id: req.user._id },
    { $set: { selfEvaluation: { score, answers: normalized, notes: notes || undefined, submittedAt: new Date() } } },
  );

  return res.json({ score, level, answers: normalized, recommendations, stats });
}

module.exports = { dashboard, insights, tips, badges, selfEval };
