# AI_CONTEXT - RouteProof

Read this first. It tells you what the project is, how it is structured, the rules the code follows, and how to extend it safely.

## 1. Product in one paragraph
An agency runs advertising on vehicles. For each advertiser (client) it creates a **campaign** with a **route** (ordered **stops**).
Each day Admin/Sub-admin assigns **drivers** to the campaign. A driver logs in on a phone, chooses **today's vehicle** (popup, saved permanently),
sees the route, and at each stop uploads an **arrival photo**, **interval photos** (every `photo_interval_min` minutes while there) and a **departure photo**.
GPS, address, time, vehicle, campaign and stop are **burned into the image** client-side. Staff review visits (approve / reject with reason) and export PDF/Excel.
Two panels only: **Admin panel** (Admin + Sub-admin) and **Driver panel**. **No live tracking** - location exists only at photo time. UI is English + Marathi.

## 2. Stack and layout
```
backend/   Node 18+, Express 4, mysql2 (plain SQL, no ORM), JWT, bcryptjs, multer, xlsx, pdfkit, pdf-parse
  sql/schema.sql         full schema (drops and recreates tables)
  src/server.js          app, static /uploads, optionally serves frontend/dist
  src/db.js              pool; dateStrings + decimalNumbers; session time zone = DB_TZ (default +05:30)
  src/auth.js            JWT auth, roles, permissions (ALL_PERMS), wrap() for async errors
  src/audit.js           audit(req, action, entity, id, details) -> audit_log
  src/geo.js             haversine(), Nominatim geocode()/reverse()
  src/importer.js        route import: PDF text lines / Excel / CSV -> stops (preview only)
  src/routes/auth.js     /auth/login, /auth/me, /auth/language, GET /vehicles
  src/routes/admin.js    dashboard, users, vehicles, campaigns, stops, import, assignments, audit
  src/routes/driver.js   /driver/today, /driver/vehicle, /driver/photo, /geo/reverse
  src/routes/visits.js   /visits, /visits/:id, review
  src/routes/reports.js  Excel/PDF exports (shared sendTable helper)
  src/initDb.js, seed.js npm run db:init / db:seed / db:reset
frontend/  React 18 + Vite + react-router 6 + lucide-react, plain CSS (src/styles.css)
  src/api.js             fetch wrapper (+ token, errors) and downloadFile()
  src/i18n.jsx           English-keyed dictionary MR{}; t('English text', {vars}); fmtDate/fmtTime
  src/stamp.js           canvas: draws GPS panel onto the photo, returns JPEG Blob
  src/ui.jsx             Modal, Field, StatusBadge, toasts, useLoad(fn, deps), LangSwitch
  src/admin/*            Dashboard, Campaigns, CampaignDetail (route + import + driver assignment), People, Vehicles, Visits (+detail/review), VehicleLog, Activity
  src/driver/*           DriverLayout (loads /driver/today, vehicle popup), DriverHome (route timeline), StopScreen, CaptureSheet (camera+GPS)
```

## 3. Roles and permissions
- `admin`: everything. `subadmin`: only permissions stored in `users.permissions` (JSON array in a TEXT column) from `campaigns, assign, drivers, vehicles, review, reports`.
- Admin creates sub-admins; Admin or sub-admin with `drivers` creates drivers. `driver`: only `/driver/*` and `/geo/reverse`.
- Middleware is attached **per route** (`const D=[auth,driverOnly]`, `S=[auth,staff]`, `R=[...]`). Do not use `router.use(auth...)` in routers mounted on the shared `/api` prefix - it leaks onto every later router.

## 4. Data model (MySQL)
`users` (role, permissions, language, is_active) - `vehicles` - `campaigns` (advertiser, name, dates, status, photo_interval_min) -
`stops` (campaign_id, seq, lat/lng, radius_m, soft-delete `is_active`) - `assignments` (campaign, driver, work_date; unique) -
`driver_vehicle_log` (work_date, driver_id, vehicle_id, campaign_id; **append-only history**, latest row of the day wins) -
`visits` (stop, campaign, driver, vehicle, work_date, status arrived|completed|approved|rejected, arrived_at, departed_at, review fields; unique per stop+driver+day) -
`photos` (visit_id, type arrival|interval|departure, file_path, lat/lng, accuracy_m, address, distance_m, within_radius, taken_at) - `audit_log`.
Rules: history is never overwritten; stops are soft-deleted; every change calls `audit()`.

## 5. Core flows
1. **Vehicle popup:** `GET /driver/today` returns `vehicle:null` until the driver posts `POST /driver/vehicle {vehicle_id}`. The frontend blocks everything behind a modal until then.
2. **Photo upload:** `POST /driver/photo` (multipart: `image`, `stop_id`, `type`, `latitude`, `longitude`, `accuracy`, `address`). Server rules:
   driver must be assigned to the stop's campaign today; vehicle must be selected; `arrival` creates the visit (409 if it exists); `interval` and `departure` need an arrived visit;
   `departure` sets `completed`. Distance to stop is computed (haversine); outside `radius_m` it is **flagged, not rejected** (`within_radius=0`).
3. **Interval reminder:** purely client-side. `StopScreen` counts down from the last photo's `ts` (`UNIX_TIMESTAMP`) using server time skew (`now_ts`).
4. **Review:** `PATCH /visits/:id/review {status: approved|rejected, reason}` (needs `review`). Rejected requires a reason.
5. **Route import:** `POST /campaigns/:id/import/preview` (file) returns parsed stops, nothing saved; `POST /campaigns/:id/stops/bulk` saves the confirmed list. `?geocode=1` fills missing coordinates through Nominatim (max 20, 1 req/s).
6. **Photo stamping** happens in the browser (`stamp.js`), so the uploaded JPEG already contains the GPS panel. The same values are stored in `photos` for queries.

## 6. API reference (all under /api, JSON, `Authorization: Bearer <token>`)
Auth: `POST /auth/login`, `GET /auth/me`, `PATCH /auth/language`, `GET /vehicles[?all=1]`.
Driver: `GET /driver/today`, `POST /driver/vehicle`, `POST /driver/photo`, `GET /geo/reverse?lat&lng`.
Staff: `GET /dashboard`; `GET|POST /users`, `PATCH /users/:id`; `POST|PATCH /vehicles`; `GET|POST /campaigns`, `GET|PATCH /campaigns/:id`;
`POST /campaigns/:id/stops`, `/stops/bulk`, `/stops/reorder`, `/import/preview`; `PATCH|DELETE /stops/:id`;
`GET|PUT /campaigns/:id/assignments?date=`; `GET /visits` (filters: date_from, date_to, campaign_id, driver_id, vehicle_id, status), `GET /visits/:id`, `PATCH /visits/:id/review`;
`GET /reports/visits?format=xlsx|pdf&...filters`, `GET /reports/vehicle-log?format=xlsx|pdf|json`; `GET /audit` (admin).
Errors are `{ "error": "message" }` with 4xx/5xx; messages are English and shown to the user, so keep them plain.

## 7. Conventions
- **Dates/time:** server stores local business time (`DB_TZ`). API returns `YYYY-MM-DD` / `YYYY-MM-DD HH:MM:SS` strings. Use `CURDATE()`/`NOW()` in SQL, never JS dates, for "today".
- **i18n:** every visible string goes through `t('English text')`. Add the Marathi to the `MR` object in `i18n.jsx`; missing keys fall back to English. Server error strings can also be keys.
- **UI:** use classes from `styles.css` (`btn primary`, `card`, `table-wrap`, `badge ok|warn|bad`, `field`, `input`). Palette: asphalt `#1C2227`, road-marking yellow `#F4B81F` (primary actions only), route green `#0F6B57`. Fonts: Bricolage Grotesque (headings) + Hind (body, supports Devanagari).
- **Empty / error states** always say what to do next. Buttons name the action ("Save stop", not "Submit").
- **SQL:** parameterised queries only, through `q/one/run` in `db.js`.
- Drivers' UI is mobile-first (max 520px column); admin is a desktop layout that collapses to a drawer under 860px.

## 8. Known limits / next steps
- Demo security: default passwords, `/uploads` is public, no rate limiting, no refresh tokens. Put photos behind an authenticated route or signed URLs for production.
- Photos stored on local disk (`backend/uploads`); move to S3 for production.
- A stop is visible to every driver assigned to the campaign that day (no per-driver stop split yet).
- Stamped GPS comes from the browser and could be spoofed; mitigation ideas: `within_radius` flags (done), accuracy checks, mock-location detection in a native wrapper, server-side image hash.
- PDF reports are English only (pdfkit default fonts). Marathi PDF needs an embedded Devanagari font plus text shaping (use headless Chrome / weasyprint).
- No automatic "missed visit" status yet; compute from assignments vs visits at end of day.
- Ideas: notifications/WhatsApp reminders, advertiser read-only login, offline photo queue (service worker), per-driver stop split, automated daily report email.

## 9. Commands
```
cd backend && npm install && npm run db:reset && npm start     # API http://localhost:5000 (needs local MySQL, set backend/.env)
cd frontend && npm install && npm start                          # http://localhost:3000, proxies /api and /uploads to :5000
cd frontend && npm run build                     # then backend serves frontend/dist
```
Seed data: users admin/priya/ravi/sunil/amit, 4 vehicles, 2 campaigns (Pune stops), today's assignment for ravi + sunil on campaign 1.
