Usta Backend (Express + Mongoose)

Overview
- Normal Express app with Mongoose models.
- Simple, human-readable controllers and routes.
- JSON responses via `res.status().json()`.

Requirements
- Node.js 18+
- MongoDB running at `mongodb://127.0.0.1:27017` (default DB: `usta`).
- Redis running at `redis://127.0.0.1:6379` (used for banner cache).

Install & Run
- Install deps: `npm install`
- Create `.env` with: `PORT=3000`, `MONGODB_URI=mongodb://127.0.0.1:27017`, `DB_NAME=usta`, `JWT_SECRET=change-me`, `REDIS_URL=redis://127.0.0.1:6379`
- Start API: `npm start`
- Dev mode: `npm run dev`
- Run tests: `npm test`
- Check syntax: `npm run check:syntax`

Project Structure
- `src/models/`
  - `artisan.model.js` – Artisan Mongoose schema
  - `customer.model.js` – Customer Mongoose schema
  - `banner.model.js` – Banner schema (dynamic marketing banners)
- `src/controllers/`
  - `admin/` – Admin domain controllers
  - `artisan/` – Artisan domain controllers
  - `customer/` – Customer domain controllers
  - `shared/` – Shared controllers (chat/notifications/upload)
  - `admin.controller.js` – Admin controller re-export (compat)
  - `banner.controller.js` – Banner CRUD + active feed
- `src/routes/`
  - `admin/` — admin routes
  - `artisan/` — artisan routes
  - `customer/` — customer routes
  - `shared/` — shared routes (chat/notifications/requests/upload)
  - `banner.routes.js` — banner routes (admin + public)
  - `index.js` — mounts routes + `/health`
- `src/middlewares/`
  - `admin/` — admin middlewares
  - `shared/` — shared middlewares (auth/chat upload/error)
  - `auth.js` — admin auth re-export
- `src/utils/`
  - `shared/` — responder/notify/pagination/objectId/email templates
  - `artisan/` — profile completion helpers
- `src/app.js` – Express app (helmet/cors/morgan/json + static `/uploads`)
- `src/server.js` – Mongoose connect + start server
- `seed/seedBanners.js` – Banner seed script

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
- Banners
  - POST `/api/admin/banners`
  - PUT `/api/admin/banners/:id`
  - DELETE `/api/admin/banners/:id`
  - GET `/api/admin/banners`
  - GET `/api/banners/active`

Notes
- Extend by adding a new model + controller + route file under the right domain folder.

Banner Seed
- Run: `node seed/seedBanners.js`

