const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const path = require("path");
const routes = require("./routes");
const { notFound, errorHandler } = require("./middlewares/shared/error");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const isWildcardCors = corsOrigins.includes("*");
const corsOptions = corsOrigins.length
  ? {
      origin(origin, cb) {
        // Allow non-browser requests with no origin (curl, server-to-server, etc.)
        if (!origin) return cb(null, true);
        if (isWildcardCors || corsOrigins.includes(origin)) return cb(null, true);
        const err = new Error(
          `Not allowed by CORS - origin: ${origin}, allowed: ${corsOrigins.join(", ")}`,
        );
        err.status = 403;
        return cb(err);
      },
      credentials: true,
      optionsSuccessStatus: 204,
    }
  : { origin: true, credentials: true, optionsSuccessStatus: 204 };

const rateWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const rateMax = Number(process.env.RATE_LIMIT_MAX) || 300;

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors(corsOptions));
app.use(
  rateLimit({
    windowMs: rateWindowMs,
    max: rateMax,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests", message: "Too many requests" },
  }),
);

// Reduce log noise from common bot probes (e.g. "/.env", "/robots.txt")
const morganFormat =
  process.env.MORGAN_FORMAT ||
  (process.env.NODE_ENV === "production" ? "combined" : "dev");
app.use(
  morgan(morganFormat, {
    skip(req) {
      const url = req.originalUrl || req.url || "";
      if (url === "/robots.txt") return true;
      if (url === "/.env" || url === "//.env" || url.endsWith("/.env"))
        return true;
      if (url.includes(".env")) return true;
      return false;
    },
  }),
);

app.use((req, res, next) => {
  req.on("aborted", () => {
    console.warn("Client aborted request early:", {
      method: req.method,
      url: req.originalUrl || req.url,
      ip: req.ip,
    });
  });
  next();
});

app.use(express.json({ limit: process.env.JSON_LIMIT || "10mb" }));

app.use("/uploads/private", (req, res) => {
  res.status(403).json({
    error: "Forbidden",
    message: "Private uploads are not publicly accessible",
    code: 403,
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
});

// Static uploads
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Lightweight root + robots (avoid 404 spam from crawlers/scanners)
app.get("/", (req, res) => res.status(200).json({ status: "ok" }));
app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send("User-agent: *\nDisallow: /\n");
});

// Routes
app.use(routes);

// 404 + Error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;
