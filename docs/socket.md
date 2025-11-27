# Socket.IO Usage

Base: same host/port as API. Connect with `auth: { token: "<JWT>" }` (customer or artisan token).

Rooms:
- Auto join: `user:<userId>`
- Subscribe to request room: emit `chat:subscribe` with `{ requestId }` to join `request:<id>`.

Events:
- `chat:message` (client→server): `{ requestId, message }` (text). Broadcasts `chat:message` to `request:<id>` with saved message document.
- `location:update` (artisan only): `{ lat, lng, requestId? }` updates artisan location; if `requestId` supplied (and owned) emits `artisan:location` to `request:<id>` with `{ requestId, lat, lng, updatedAt }`.
- `connected`: emitted on connect with `{ userId, role }`.
- Errors: `error` event payload `{ error }`.

Direct chat (قبل إنشاء الطلب):
- Subscribe room: `direct:subscribe` with `{ artisanId }` from customer OR `{ customerId }` from artisan. Room name `direct:<customerId>:<artisanId>`.
- Send message: `direct:message` with `{ artisanId, customerId, message, attachments? }` (sender inferred from token). Broadcasts `direct:message` with saved document.
