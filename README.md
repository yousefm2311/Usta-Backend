Usta Backend (Express + Mongoose)

Overview
- Normal Express app with Mongoose models.
- Simple, human-readable controllers and routes.
- JSON responses via `res.status().json()` (no custom utils/services).

Requirements
- Node.js 18+
- MongoDB running at `mongodb://127.0.0.1:27017` (default DB: `usta`).

Install & Run
- Install deps: `npm install`
- Create `.env` with: `PORT=3000`, `MONGODB_URI=mongodb://127.0.0.1:27017`, `DB_NAME=usta`, `JWT_SECRET=change-me`
- Start API: `npm start`
- Dev mode: `npm run dev`

Project Structure
- `src/models/`
  - `artisan.model.js` – Artisan Mongoose schema
  - `customer.model.js` – Customer Mongoose schema
- `src/controllers/`
  - `artisan.controller.js` – Signup/Login/Profile/Update/Change password
  - `customer.controller.js` – Signup/Login/Profile/Update/Change password
- `src/routes/`
  - `artisan.routes.js` – `/api/artisan/*`
  - `customer.routes.js` – `/api/customer/*`
  - `index.js` – mounts routes + `/health`
- `src/middlewares/`
  - `auth.js` – JWT auth for artisan/customer
  - `error.js` – 404 + error handler
- `src/app.js` – Express app (helmet/cors/morgan/json + static `/uploads`)
- `src/server.js` – Mongoose connect + start server

Key Endpoints
- Artisan
  - POST `/api/artisan/signup`
  - POST `/api/artisan/login`
  - GET `/api/artisan/me`
  - PUT `/api/artisan/me`
  - PUT `/api/artisan/location`
  - PUT `/api/artisan/change-password`
- Customer
  - POST `/api/customer/signup`
  - POST `/api/customer/login`
  - GET `/api/customer/me`
  - PUT `/api/customer/me`
  - PUT `/api/customer/change-password`

Notes
- Extend by adding new model + controller + route file; keep logic simple.

