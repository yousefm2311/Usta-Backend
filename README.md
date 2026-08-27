<div align="center">
  <h1>🛠️ Usta Backend API</h1>
  
  **A highly scalable, robust REST API for the Usta Service Marketplace platform connecting customers with professional artisans.**

  [![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
  [![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge)](https://expressjs.com/)
  [![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
  [![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
  [![Socket.io](https://img.shields.io/badge/Socket.io-black?style=for-the-badge&logo=socket.io&badgeColor=010101)](https://socket.io/)
  [![Firebase](https://img.shields.io/badge/Firebase-039BE5?style=for-the-badge&logo=Firebase&logoColor=white)](https://firebase.google.com/)
  [![AWS](https://img.shields.io/badge/AWS-%23FF9900.svg?style=for-the-badge&logo=amazon-aws&logoColor=white)](https://aws.amazon.com/)
</div>

---

## 📖 Overview

**Usta** is a comprehensive multi-sided service marketplace that bridges the gap between Customers and skilled Artisans (Craftsmen/Workers). This repository contains the backend engine powering the entire platform. It provides a highly secure, real-time, and location-aware RESTful API built on Node.js and Express, with MongoDB as the primary database. 

It handles everything from complex geographical artisan queries and robust KYC (Know Your Customer) identity verification flows using AWS Rekognition, to real-time chat direct messaging and push notifications via Firebase.

---

## ✨ Key Features

### 👨‍🔧 Artisan (Provider) Capabilities
* **KYC & Face Verification:** Automated identity and liveness checks integrated with AWS Rekognition.
* **Real-time Location:** Dynamic geo-tracking allowing nearby customers to discover them.
* **Service Requests Management:** Accept, reject, and negotiate incoming service requests.
* **Digital Wallet & Rewards:** Track earnings, transactions, and level up through platform rewards.
* **Portfolio Showcase:** Upload and manage previous work images (optimized via Sharp).

### 🙍‍♂️ Customer Capabilities
* **Geo-based Discovery:** Find artisans within a specific radius efficiently using MongoDB geospatial queries.
* **Service Bidding & Requests:** Request services dynamically and track request timelines.
* **Promocodes & Referrals:** Built-in discount and referral systems to boost growth.
* **Ratings & Reviews:** Leave verified feedback on completed requests.

### 🛡️ Admin Controls
* **Platform Management:** Full oversight of users, complaints, and reports.
* **KYC Approvals:** Manual override or review for automated identity verifications.
* **Dynamic Banners:** Control marketing banners directly synced with Redis for ultra-fast fetching.
* **Push Broadcasts:** Send customized FCM notifications to specific user segments.

### ⚡ Shared Engine
* **Real-time Chat Engine:** Powered by Socket.io, supporting text, audio, and media attachments.
* **Push Notifications:** Centralized Firebase Cloud Messaging (FCM) integration.
* **Optimized Storage:** Secure Multer-based local storage handling with automatic image optimization via Sharp.

---

## 🏗 Architecture & Tech Stack

This project follows a domain-driven architectural approach separating concerns by platform actor (`Admin`, `Artisan`, `Customer`, `Shared`).

* **Runtime:** [Node.js](https://nodejs.org/) (v18+)
* **Framework:** [Express.js](https://expressjs.com/)
* **Database:** [MongoDB](https://www.mongodb.com/) (Mongoose ORM)
* **Caching & Queue:** [Redis](https://redis.io/)
* **Real-time:** [Socket.io](https://socket.io/)
* **Security:** `helmet`, `express-rate-limit`, JWT Auth, `bcryptjs`
* **Integrations:** Firebase Admin SDK, AWS SDK (Rekognition), Nodemailer

### 📂 Directory Structure

```text
Usta-Backend/
├── src/
│   ├── controllers/      # Route handlers grouped by domain (admin, artisan, customer, shared)
│   ├── errors/           # Custom API Error classes and handling
│   ├── middlewares/      # Express middlewares (Auth, Rate Limiting, Uploads)
│   ├── models/           # Mongoose schemas (28+ schemas)
│   ├── routes/           # Express router definitions
│   ├── services/         # Complex business logic (KYC, FCM, Redis, Requests)
│   ├── utils/            # Helper functions (Pagination, Mailers, Generators)
│   ├── validations/      # Request body validation schemas
│   ├── app.js            # Express application setup
│   ├── server.js         # Entry point (HTTP server & Mongoose connect)
│   └── socket.js         # Socket.io initialization & events
├── scripts/              # Cronjobs and maintenance scripts
├── test/                 # Test suites
├── Postman Collection/   # API documentation & testing collections
└── uploads/              # Local storage for avatars, portfolios, and chat media (Ignored in Git)
```

---

## 🚀 Getting Started

### Prerequisites
Before running the project locally, ensure you have the following installed:
* Node.js (v18 or higher)
* MongoDB (running locally on port 27017 or a MongoDB Atlas cluster)
* Redis (running locally on port 6379)
* Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/Usta-Backend.git
   cd Usta-Backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Copy the example environment file and configure it:
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` to match your local setup (See the Environment Variables section).*

4. **Initialize Firebase (Optional but recommended)**
   * Place your Firebase Admin SDK JSON key in `keys/firebase.json`.
   * Ensure `FIREBASE_SERVICE_ACCOUNT=./keys/firebase.json` in your `.env`.

5. **Start the Development Server**
   ```bash
   npm run dev
   ```
   *The server will start on `http://localhost:8000` (or your configured port).*

---

## ⚙️ Environment Variables Setup

Here is a breakdown of the critical `.env` configurations:

| Variable | Description |
|----------|-------------|
| `PORT` | API Server Port (Default: 8000) |
| `MONGODB_URI` | MongoDB Connection String |
| `REDIS_URL` | Redis Connection URL |
| `JWT_SECRET` | Secret key for signing JSON Web Tokens |
| `SMTP_*` | Nodemailer SMTP configurations (Gmail App Passwords recommended) |
| `FIREBASE_SERVICE_ACCOUNT` | Relative path to your Firebase JSON key |
| `RATE_LIMIT_MAX` | Max requests per IP within the rate limit window |
| `CORS_ORIGINS` | Allowed frontend domains (comma-separated) |

---

## 📚 API Documentation

Complete and extensive API documentation is provided via **Postman Collections**. 

You can find the collections grouped by roles inside the repository:
* 📂 `Postman Collection/`
  * `Usta Admin API.postman_collection.json`
  * `Usta Backend Artisan.postman_collection.json`
  * `Usta Backend Customer.postman_collection.json`

Simply import these files into your Postman workspace to explore the endpoints, required payloads, and authorization headers.

---

## 🛠️ Available Scripts

* `npm run dev` : Starts the server in development mode using Nodemon.
* `npm start` : Starts the server in production mode.
* `npm test` : Runs the native Node.js test suites.
* `npm run check:syntax` : Verifies syntax across all JS files.
* `npm run expire-requests` : Runs the script to handle stale service requests.
* `npm run optimize-uploads` : Script to compress and optimize images in the local `uploads/` directory.

---

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the UNLICENSED License. All rights reserved.
