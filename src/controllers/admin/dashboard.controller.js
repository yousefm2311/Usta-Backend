const { dataResponse } = require("../../utils/shared/responder");
const Customer = require("../../models/customer.model");
const Artisan = require("../../models/artisan.model");
const Request = require("../../models/request.model");
const Transaction = require("../../models/transaction.model");
const Review = require("../../models/review.model");
const ActivityLog = require("../../models/activityLog.model");

async function adminDashboard(req, res) {
  const [customers, artisans, requests, completed, revenue] = await Promise.all(
    [
      Customer.countDocuments({ deleted: { $ne: true } }),
      Artisan.countDocuments({ deleted: { $ne: true } }),
      Request.countDocuments({}),
      Request.countDocuments({ status: "completed" }),
      Transaction.aggregate([
        { $group: { _id: null, total: { $sum: "$debit" } } },
      ]),
    ]
  );
  return res.json({
    customers,
    artisans,
    requests,
    completedRequests: completed,
    totalRevenue: revenue[0]?.total || 0,
  });
}

async function analyticsDaily(req, res) {
  const dailyRequests = await Request.aggregate([
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        total: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const dailySignups = await Customer.aggregate([
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        total: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return res.json({ dailyRequests, dailySignups });
}

async function analyticsRevenue(req, res) {
  const monthly = await Transaction.aggregate([
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
        total: { $sum: "$debit" },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return res.json({ monthly });
}

async function analyticsActiveUsers(req, res) {
  const topCustomers = await Request.aggregate([
    { $group: { _id: "$customerId", total: { $sum: 1 } } },
    { $sort: { total: -1 } },
    { $limit: 10 },
  ]);
  const topArtisans = await Request.aggregate([
    { $match: { status: "completed" } },
    { $group: { _id: "$artisanId", total: { $sum: 1 } } },
    { $sort: { total: -1 } },
    { $limit: 10 },
  ]);
  return res.json({ topCustomers, topArtisans });
}

async function dashboardStats(req, res) {
  const [customers, artisans, requests, completed, revenue] = await Promise.all(
    [
      Customer.countDocuments({ deleted: { $ne: true } }),
      Artisan.countDocuments({ deleted: { $ne: true } }),
      Request.countDocuments({}),
      Request.countDocuments({ status: "completed" }),
      Transaction.aggregate([
        { $group: { _id: null, total: { $sum: "$debit" } } },
      ]),
    ]
  );
  return res.json(
    dataResponse({
      customers,
      artisans,
      requests,
      completedRequests: completed,
      totalRevenue: revenue[0]?.total || 0,
    })
  );
}

async function dashboardActivity(req, res) {
  const events = await ActivityLog.find({}).sort({ createdAt: -1 }).limit(20);
  return res.json(dataResponse(events));
}

async function dashboardTopArtisans(req, res) {
  const agg = await Review.aggregate([
    {
      $group: {
        _id: "$artisanId",
        avg: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
    { $sort: { avg: -1, count: -1 } },
    { $limit: 5 },
  ]);
  const ids = agg.map((a) => a._id).filter(Boolean);
  const artisans = await Artisan.find({ _id: { $in: ids } }).select(
    "name email profession avatar"
  );
  const map = new Map(artisans.map((a) => [String(a._id), a]));
  const data = agg.map((a) => ({
    artisanId: a._id,
    artisan: map.get(String(a._id)),
    avg: a.avg,
    count: a.count,
  }));
  return res.json(dataResponse(data));
}

module.exports = {
  adminDashboard,
  analyticsDaily,
  analyticsRevenue,
  analyticsActiveUsers,
  dashboardStats,
  dashboardActivity,
  dashboardTopArtisans,
};

