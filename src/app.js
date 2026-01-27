const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/shared/error');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// Static uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Routes
app.use(routes);

// 404 + Error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;


