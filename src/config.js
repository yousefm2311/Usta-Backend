require('dotenv').config();
module.exports = {
  port: Number(process.env.PORT || 3000),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  dbName: process.env.DB_NAME || 'usta',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
};
