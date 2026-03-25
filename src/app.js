const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/shared/error');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOptions = corsOrigins.length
  ? {
    origin(origin, cb) {
      if (!origin || corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }
  : { origin: true, credentials: true };

const rateWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const rateMax = Number(process.env.RATE_LIMIT_MAX) || 300;

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(corsOptions));
app.use(rateLimit({
  windowMs: rateWindowMs,
  max: rateMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests', message: 'Too many requests' },
}));

// Reduce log noise from common bot probes (e.g. "/.env", "/robots.txt")
const morganFormat = process.env.MORGAN_FORMAT || (process.env.NODE_ENV === 'production' ? 'combined' : 'dev');
app.use(morgan(morganFormat, {
  skip(req) {
    const url = req.originalUrl || req.url || '';
    if (url === '/robots.txt') return true;
    if (url === '/.env' || url === '//.env' || url.endsWith('/.env')) return true;
    if (url.includes('.env')) return true;
    return false;
  },
}));
app.use(express.json({ limit: process.env.JSON_LIMIT || '10mb' }));

// Static uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Lightweight root + robots (avoid 404 spam from crawlers/scanners)
app.get('/', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /\n');
});

// Routes
app.use(routes);

// 404 + Error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;


