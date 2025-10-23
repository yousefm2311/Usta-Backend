const mongoose = require("mongoose");
const config = require("./config");
const app = require("./app");

async function start() {
  const uri = process.env.MONGODB_URI || config.mongodbUri;
  const dbName = process.env.DB_NAME || config.dbName;
  await mongoose.connect(uri, { dbName });
  const PORT = process.env.PORT || 5000;
  const HOST = "0.0.0.0";
  app.listen(config.port, HOST, () =>
    console.log(`✅ Server running on http://${HOST}:${PORT}`)
  );
}

// Global safety nets
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception", err);
});

start().catch((e) => {
  console.error("Fatal startup error", e);
  process.exit(1);
});
