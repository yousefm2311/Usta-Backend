const { dataResponse } = require("../../utils/shared/responder");
const Review = require("../../models/review.model");
const Request = require("../../models/request.model");
const Complaint = require("../../models/complaint.model");
const Artisan = require("../../models/artisan.model");

async function aiReviewsAnalysis(req, res) {
  const rows = await Review.find({}).sort({ createdAt: -1 }).limit(500);
  const posWords = ["great", "good", "excellent", "perfect", "amazing"];
  const negWords = ["bad", "poor", "terrible", "awful", "worst"];
  let pos = 0,
    neg = 0,
    neutral = 0;
  for (const r of rows) {
    const c = (r.comment || "").toLowerCase();
    const hasPos = posWords.some((w) => c.includes(w));
    const hasNeg = negWords.some((w) => c.includes(w));
    if (hasPos && !hasNeg) pos++;
    else if (hasNeg && !hasPos) neg++;
    else neutral++;
  }
  return res.json({
    total: rows.length,
    positive: pos,
    negative: neg,
    neutral,
  });
}

async function aiTopArtisans(req, res) {
  try {
    const agg = await Review.aggregate([
      {
        $group: {
          _id: "$artisanId",
          avg: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
      { $sort: { avg: -1, count: -1 } },
      { $limit: 10 },
    ]);
    const ids = agg.map((a) => a._id).filter(Boolean);
    const artisans = await Artisan.find({ _id: { $in: ids } }).select(
      "name email phone profession avatar"
    );
    const map = new Map(artisans.map((a) => [String(a._id), a]));
    const result = agg.map((a) => ({
      artisanId: a._id,
      artisan: map.get(String(a._id)) || null,
      avg: a.avg,
      count: a.count,
    }));

    return res.json({ top: result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function aiFraudDetection(req, res) {
  const cancelAgg = await Request.aggregate([
    {
      $group: {
        _id: "$customerId",
        cancelled: {
          $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
        },
        total: { $sum: 1 },
      },
    },
    {
      $project: {
        rate: {
          $cond: [
            { $eq: ["$total", 0] },
            0,
            { $divide: ["$cancelled", "$total"] },
          ],
        },
      },
    },
    { $match: { rate: { $gt: 0.5 } } },
    { $sort: { rate: -1 } },
  ]);
  return res.json({ suspiciousCustomers: cancelAgg });
}

async function aiWordCloud(req, res) {
  const reviews = await Review.find({}).select("comment").limit(1000);
  const complaints = await Complaint.find({})
    .select("issue messages")
    .limit(300);
  const texts = [];
  reviews.forEach((r) => texts.push(r.comment || ""));
  complaints.forEach((c) => {
    texts.push(c.issue || "");
    (c.messages || []).forEach((m) => texts.push(m.message || ""));
  });
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "???",
    "???",
    "???",
    "???",
    "??",
    "??",
    "???",
    "your",
    "you",
    "are",
    "but",
    "not",
    "??",
    "???",
    "???",
    "was",
    "were",
  ]);
  const counts = {};
  for (const text of texts) {
    const words = (text || "")
      .toLowerCase()
      .replace(/[^a-z\u0600-\u06FF\s]/g, " ")
      .split(/\s+/);
    for (const w of words) {
      if (!w || w.length < 3) continue;
      if (stop.has(w)) continue;
      counts[w] = (counts[w] || 0) + 1;
    }
  }
  const cloud = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([word, count]) => ({ word, count }));
  return res.json(dataResponse(cloud));
}

module.exports = {
  aiReviewsAnalysis,
  aiTopArtisans,
  aiFraudDetection,
  aiWordCloud,
};

