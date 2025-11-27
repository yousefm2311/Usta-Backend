# Admin API Changes Summary

- Added dashboard endpoints: `/api/admin/dashboard/stats`, `/api/admin/dashboard/activity`, `/api/admin/dashboard/top-artisans`.
- New customer block (body) endpoint: `PUT /api/admin/customers/block` with `{ customerId, blocked? }`.
- New artisan approve/reject (body) endpoints: `PUT /api/admin/artisans/approve`, `PUT /api/admin/artisans/reject` with `{ artisanId, reason? }`.
- Orders/requests messaging/timeline/close/cancel endpoints standardized to return `{ data: ... }` (e.g., `/orders/:id/messages`, `/orders/:id/timeline`, `/orders/:id/close`, `/orders/:id/cancel`).
- Notifications history now available via `GET /api/admin/notifications/history`, notifications list returns `{ data: [...] }`.
- Auth hardening: blocked customers and suspended/unapproved artisans are denied login + all authenticated calls; artisans cannot add/update/delete services or pricing until verified; suspended artisans blocked from these actions too.
- Requests: artisans see new + assigned requests; accepting assigned request requires matching artisanId; admin can set status `assigned` with `artisanId`.
- Socket.io added (app-level): chat messages + artisan live location events (`chat:message`, `chat:subscribe`, `location:update`, `artisan:location`) with JWT auth in `handshake.auth.token`. See `docs/socket.md`.
- Direct chat قبل إنشاء الطلب: events `direct:subscribe` و`direct:message` بين العميل والحرفي، مع تخزين الرسائل في `directMessage` collection.
- Error payload unified: `{ error, message, code, details?, path, method, timestamp, stack? }`.
- Postman collections updated: `postman/admin.postman_collection.json` and `Postman Collection/Usta Admin API.postman_collection.json` include all admin endpoints with sample requests.
