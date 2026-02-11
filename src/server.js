const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const config = require('./config');
const app = require('./app');
const { initSockets } = require('./socket');

async function start() {
  try {
    const uri = process.env.MONGODB_URI || config.mongodbUri;
    const dbName = process.env.DB_NAME || config.dbName;

    await mongoose.connect(uri, { dbName });

    console.log(`✅ Connected to MongoDB database: ${dbName}`);

    const PORT = process.env.PORT || 5000;
    const HOST = '0.0.0.0';

    const server = http.createServer(app);
    const corsOrigins = (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    const socketCors = corsOrigins.length
      ? { origin: corsOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE'], credentials: true }
      : { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] };
    const io = new Server(server, { cors: socketCors });
    initSockets(io);

    server.listen(PORT, HOST, () => console.log(`🚀 Server running on http://${HOST}:${PORT}`));
  } catch (e) {
    console.error('❌ Fatal startup error', e);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => { console.error('Unhandled Rejection', reason); });
process.on('uncaughtException', (err) => { console.error('Uncaught Exception', err); });

start();
