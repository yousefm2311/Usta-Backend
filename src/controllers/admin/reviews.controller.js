const { assertObjectId } = require("../../utils/shared/objectId");
const Review = require("../../models/review.model");

async function listReviews(req, res) {
  try {
    const rows = await Review.find({})
      .populate("customerId", "name phone")
      .populate("artisanId", "name phone")
      .sort({ createdAt: -1 })
      .limit(200);

    return res.json({ reviews: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function filterReviews(req, res) {
  const { artisan, rating } = req.query;
  const q = {};
  if (artisan) q.artisanId = artisan;
  if (rating) q.rating = Number(rating);
  const rows = await Review.find(q).sort({ createdAt: -1 }).limit(200);
  return res.json({ reviews: rows });
}

async function deleteReview(req, res) {
  assertObjectId(req.params.id, "reviewId");
  await Review.deleteOne({ _id: req.params.id });
  return res.json({ ok: true });
}

async function reviewStats(req, res) {
  const agg = await Review.aggregate([
    {
      $group: {
        _id: "$artisanId",
        avg: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
    { $sort: { avg: -1 } },
  ]);
  return res.json({ stats: agg });
}

module.exports = {
  listReviews,
  filterReviews,
  deleteReview,
  reviewStats,
};

