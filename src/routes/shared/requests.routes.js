const express = require("express");
const { param, body, validationResult } = require("express-validator");
const ctrl = require("../../controllers/artisan/requests.controller");
const priceCtrl = require("../../controllers/customer/requestPricing.controller");
const priceValidation = require("../../validations/customer/requestPricing.validation");
const { auth } = require("../../middlewares/shared/auth");
const { requireVerifiedArtisan } = require("../../middlewares/artisan/requireVerifiedArtisan");

const router = express.Router();

function ok(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation error",
      message: "Validation error",
      code: 400,
      details: errors.array(),
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
    });
  }
  next();
}

router.get("/api/artisan/requests/new", auth("artisan"), (req, res, next) =>
  ctrl.getNewRequests(req, res).catch(next)
);
router.post(
  "/api/artisan/requests/:id/accept",
  auth("artisan"),
  requireVerifiedArtisan,
  param("id").isLength({ min: 24, max: 24 }),
  body("price").optional().isNumeric(),
  body("note").optional().isString(),
  ok,
  (req, res, next) => ctrl.acceptRequest(req, res).catch(next)
);
router.post(
  "/api/artisan/requests/:id/reject",
  auth("artisan"),
  requireVerifiedArtisan,
  param("id").isLength({ min: 24, max: 24 }),
  body("reason").optional().isString(),
  ok,
  (req, res, next) => ctrl.rejectRequest(req, res).catch(next)
);
router.get("/api/artisan/requests/active", auth("artisan"), (req, res, next) =>
  ctrl.getActiveRequests(req, res).catch(next)
);
router.post(
  "/api/artisan/requests/:id/timeline",
  auth("artisan"),
  requireVerifiedArtisan,
  param("id").isLength({ min: 24, max: 24 }),
  body("status").isString(),
  body("note").optional().isString(),
  ok,
  (req, res, next) => ctrl.updateRequestTimeline(req, res).catch(next)
);
router.post(
  "/api/artisan/requests/:id/complete",
  auth("artisan"),
  requireVerifiedArtisan,
  param("id").isLength({ min: 24, max: 24 }),
  body("note").optional().isString(),
  ok,
  (req, res, next) => ctrl.completeRequest(req, res).catch(next)
);
router.get("/api/artisan/requests/history", auth("artisan"), (req, res, next) =>
  ctrl.getHistory(req, res).catch(next)
);
router.get(
  "/api/artisan/requests/:id/timeline",
  auth("artisan"),
  param("id").isLength({ min: 24, max: 24 }),
  ok,
  (req, res, next) => ctrl.getRequestTimeline(req, res).catch(next)
);
router.get(
  "/api/artisan/requests/:id",
  auth("artisan"),
  param("id").isLength({ min: 24, max: 24 }),
  ok,
  (req, res, next) => ctrl.getRequestDetail(req, res).catch(next)
);

// Customer price decision flow
router.post(
  "/api/requests/:id/price/decision",
  auth("customer"),
  ...priceValidation.priceDecisionValidation,
  ok,
  (req, res, next) => priceCtrl.decidePrice(req, res).catch(next)
);
router.get(
  "/api/requests/:id",
  auth("customer"),
  ...priceValidation.getRequestValidation,
  ok,
  (req, res, next) => priceCtrl.getRequestDetails(req, res).catch(next)
);
module.exports = router;


