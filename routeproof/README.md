# RouteProof - vehicle advertising proof-of-display (demo)

Admins create **campaigns** for an advertiser, add the **route** (import the advertiser's PDF/Excel or add stops by hand) and
**assign drivers** for the day. Each driver opens the app, picks **today's vehicle** in a popup, then follows the route.
At every stop the driver takes an **arrival photo**, more photos every few minutes, and a **departure photo**.
**GPS, address, date/time, vehicle and stop are printed on the photo itself.** Admins review the photos, approve/reject them and export PDF/Excel.

Stack: **Node.js + Express**, **React (Vite)**, **MySQL**. English / Marathi UI. No live tracking: location is recorded only when a photo is taken.

## Quick start (no Docker)

Requirements: **Node.js 18+** and **MySQL 8** (or MariaDB / XAMPP MySQL) running on your PC.

```
routeproof/
  backend/    Node + Express API      -> http://localhost:5000
  frontend/   React app (Vite)        -> http://localhost:3000   (open this one)
```

```bash
# 1. Backend  (terminal 1)
cd backend
npm install
# open backend/.env and set DB_USER / DB_PASSWORD for your MySQL
npm run db:reset        # creates the "routeproof" database, tables and demo data
npm start               # API on http://localhost:5000

# 2. Frontend (terminal 2)
cd frontend
npm install
npm start               # app on http://localhost:3000
```

Open **http://localhost:3000**. The frontend forwards `/api` and `/uploads` to the backend automatically.

Single-server option: `cd frontend && npm run build`, then `cd ../backend && npm start` and open http://localhost:5000.

## Demo logins

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `admin123` |
| Sub-admin | `priya` | `priya123` |
| Driver | `ravi` / `sunil` / `amit` | `driver123` |

`ravi` and `sunil` are already assigned to today's campaign "Festive Offer Van Tour" (5 stops around Pune).

## Try the full flow (5 minutes)

1. Log in as **ravi** (phone or a narrow browser window). Pick a vehicle in the popup.
2. Open the first stop, tap **I've arrived - take photo**. Allow camera and location.
   On a desktop without GPS press **Use stop location (demo)** (shown when `VITE_DEMO_MODE=true`).
3. Capture - the GPS panel is burned into the image - **Upload**. Add an interval photo, then **Leaving - take departure photo**.
4. Log in as **admin**: Dashboard shows the photos, **Visits** shows the visit with a map, **Approve/Reject**, export **Excel/PDF**.
5. **Campaigns > Festive Offer > Route > Import route** to try PDF/Excel import; **Drivers** tab assigns drivers per day.
6. **Driver-vehicle log** shows who had which vehicle on which day.

## Notes

- Camera and GPS in browsers need **HTTPS or localhost**. To test on a real phone use an HTTPS tunnel (e.g. `ngrok http 3000`) or deploy behind HTTPS.
  If the live camera is unavailable the app falls back to the phone's camera app.
- Address lookup and "find map locations" use OpenStreetMap Nominatim (free, needs internet, 1 request/second). For production use a paid geocoder.
- PDF route import is best effort (text PDFs, one stop per line). Admin always reviews the stops before saving.
- PDF reports are English only (Excel exports keep Marathi text). Add a Devanagari font to `pdfkit` if Marathi PDF is needed.
- Demo shortcuts to replace before real use: default passwords, `JWT_SECRET`, open `/uploads` folder (photos are not behind login), no rate limiting.

See **AI_CONTEXT.md** for the architecture, data model and API reference (written so an AI assistant can continue the project).
