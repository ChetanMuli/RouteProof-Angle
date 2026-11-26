const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { q, one, run } = require('../db');
const { wrap, auth, driverOnly } = require('../auth');
const { haversine, reverse } = require('../geo');
const { audit } = require('../audit');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

// Business date folder matching DB_TZ (default +05:30) so midnight uploads align with CURDATE()
function businessDateFolder() {
  const tz = process.env.DB_TZ || '+05:30';
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(tz);
  const offsetMin = m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : 330;
  const d = new Date(Date.now() + offsetMin * 60000);
  return d.toISOString().slice(0, 10);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const dir = path.join(UPLOAD_DIR, businessDateFolder());
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (err) {
        cb(err);
      }
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    cb(/^image\/(jpeg|png|webp)$/.test(file.mimetype) ? null : new Error('Only image files are allowed'), /^image\/(jpeg|png|webp)$/.test(file.mimetype)),
});

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const D = [auth, driverOnly];

const parseIds = (raw) => {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length ? arr.map(Number) : null;
  } catch {
    return null;
  }
};

async function currentVehicle(driverId) {
  return one(
    `SELECT v.id, v.number, v.type FROM driver_vehicle_log l JOIN vehicles v ON v.id=l.vehicle_id
     WHERE l.driver_id=? AND l.work_date=CURDATE() ORDER BY l.id DESC LIMIT 1`,
    [driverId]
  );
}

/* Today's work: vehicle + assigned campaigns + stops (respecting stop split) + latest attempt progress */
router.get('/driver/today', D, wrap(async (req, res) => {
  const driverId = req.user.id;
  const { d: date } = await one('SELECT CURDATE() d');
  const vehicle = await currentVehicle(driverId);
  const campaigns = await q(
    `SELECT c.id, c.advertiser, c.name, c.photo_interval_min, c.min_stay_min, c.notes, a.stop_ids
     FROM assignments a JOIN campaigns c ON c.id=a.campaign_id
     WHERE a.driver_id=? AND a.work_date=CURDATE() AND a.is_active=1
       AND c.status='active' AND c.start_date<=CURDATE() AND c.end_date>=CURDATE()
     ORDER BY c.name`,
    [driverId]
  );
  for (const c of campaigns) {
    const splitIds = parseIds(c.stop_ids);
    delete c.stop_ids;
    let stops = await q(
      `SELECT id, seq, name, address, latitude, longitude, radius_m, COALESCE(min_stay_min, ?) AS min_stay_min, instructions
       FROM stops WHERE campaign_id=? AND is_active=1 ORDER BY seq`,
      [c.min_stay_min, c.id]
    );
    if (splitIds) stops = stops.filter((s) => splitIds.includes(s.id));
    c.stops = stops;

    const visits = await q(
      `SELECT id, stop_id, attempt, status, arrived_at, departed_at, min_stay_met, flag_reason, review_reason,
              UNIX_TIMESTAMP(arrived_at) arrived_ts
       FROM visits
       WHERE driver_id=? AND campaign_id=? AND work_date=CURDATE()
       ORDER BY attempt DESC`,
      [driverId, c.id]
    );
    const latestByStop = new Map();
    for (const v of visits) if (!latestByStop.has(v.stop_id)) latestByStop.set(v.stop_id, v);
    const activeVisits = [...latestByStop.values()];
    const photos = activeVisits.length
      ? await q(
          'SELECT visit_id, type, taken_at, UNIX_TIMESTAMP(taken_at) ts, file_path, distance_m, within_radius, is_flagged, flag_notes FROM photos WHERE visit_id IN (?) ORDER BY taken_at',
          [activeVisits.map((v) => v.id)]
        )
      : [];
    for (const v of activeVisits) v.photos = photos.filter((p) => p.visit_id === v.id);
    for (const s of c.stops) s.visit = latestByStop.get(s.id) || null;
  }
  res.json({ date, now_ts: Math.floor(Date.now() / 1000), vehicle, campaigns });
}));

/* Vehicle popup: choose from list OR type a custom vehicle number */
router.post('/driver/vehicle', D, wrap(async (req, res) => {
  const { vehicle_id, vehicle_number, vehicle_type } = req.body || {};
  let vehicle = null;
  if (vehicle_id) {
    vehicle = await one('SELECT * FROM vehicles WHERE id=? AND is_active=1', [vehicle_id]);
  } else if (vehicle_number) {
    const num = String(vehicle_number).toUpperCase().replace(/\s+/g, '');
    if (num.length < 4) return bad(res, 'Enter a valid vehicle number');
    vehicle = await one('SELECT * FROM vehicles WHERE number=?', [num]);
    if (!vehicle) {
      const ins = await run('INSERT INTO vehicles (number, type, owner) VALUES (?,?,?)', [num, vehicle_type || 'Driver entered', 'Temporary / Driver']);
      vehicle = await one('SELECT * FROM vehicles WHERE id=?', [ins.insertId]);
      await audit(req, 'create_vehicle_driver', 'vehicle', vehicle.id, null, null, { number: num });
    } else if (!vehicle.is_active) {
      await run('UPDATE vehicles SET is_active=1 WHERE id=?', [vehicle.id]);
    }
  }
  if (!vehicle) return bad(res, 'Choose a vehicle from the list or type a valid number');
  const first = await one('SELECT campaign_id FROM assignments WHERE driver_id=? AND work_date=CURDATE() AND is_active=1 ORDER BY id LIMIT 1', [req.user.id]);
  const r = await run('INSERT INTO driver_vehicle_log (work_date, driver_id, vehicle_id, campaign_id) VALUES (CURDATE(),?,?,?)', [
    req.user.id,
    vehicle.id,
    first?.campaign_id || null,
  ]);
  await audit(req, 'select_vehicle', 'vehicle', vehicle.id, { number: vehicle.number });
  res.json({ log_id: r.insertId, vehicle: { id: vehicle.id, number: vehicle.number, type: vehicle.type } });
}));

/* Driver's own history of past days, vehicles and campaigns */
router.get('/driver/history', D, wrap(async (req, res) => {
  const driverId = req.user.id;
  const vehicleLogs = await q(
    `SELECT l.work_date, v.number vehicle_number, v.type vehicle_type, c.name campaign_name, c.advertiser, l.selected_at
     FROM driver_vehicle_log l
     JOIN vehicles v ON v.id=l.vehicle_id
     LEFT JOIN campaigns c ON c.id=l.campaign_id
     WHERE l.driver_id=? ORDER BY l.work_date DESC, l.id DESC LIMIT 60`,
    [driverId]
  );
  const visits = await q(
    `SELECT vi.id, vi.work_date, vi.attempt, vi.status, vi.arrived_at, vi.departed_at, vi.min_stay_met, vi.flag_reason, vi.review_reason,
            TIMESTAMPDIFF(MINUTE, vi.arrived_at, vi.departed_at) duration_min,
            COALESCE(vi.stop_name_snap, s.name) stop_name, c.name campaign_name, c.advertiser, v.number vehicle_number,
            (SELECT COUNT(*) FROM photos p WHERE p.visit_id=vi.id) photo_count,
            (SELECT p.file_path FROM photos p WHERE p.visit_id=vi.id ORDER BY p.taken_at LIMIT 1) thumb
     FROM visits vi
     JOIN stops s ON s.id=vi.stop_id
     JOIN campaigns c ON c.id=vi.campaign_id
     JOIN vehicles v ON v.id=vi.vehicle_id
     WHERE vi.driver_id=?
     ORDER BY vi.work_date DESC, vi.arrived_at DESC LIMIT 100`,
    [driverId]
  );
  res.json({ vehicle_logs: vehicleLogs, visits });
}));

router.get('/geo/reverse', D, wrap(async (req, res) => {
  const lat = +req.query.lat, lng = +req.query.lng;
  if (isNaN(lat) || isNaN(lng)) return bad(res, 'lat and lng required');
  res.json({ address: await reverse(lat, lng) });
}));

/* Photo upload with server-side integrity checks (duplicate hash, accuracy, radius, jump, min-stay) */
router.post('/driver/photo', D, upload.single('image'), wrap(async (req, res) => {
  const cleanup = () => req.file && fs.unlink(req.file.path, () => {});
  try {
    const { stop_id, type, latitude, longitude, accuracy, address, redo, captured_offline, taken_at } = req.body;
    if (!req.file) return bad(res, 'Photo is missing');
    if (!['arrival', 'interval', 'departure'].includes(type)) { cleanup(); return bad(res, 'Invalid photo type'); }
    const lat = parseFloat(latitude), lng = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      cleanup();
      return bad(res, 'GPS location is missing. Turn on location and try again.');
    }

    const stop = await one(
      `SELECT s.*, c.status campaign_status, c.start_date, c.end_date, c.min_stay_min camp_min_stay
       FROM stops s JOIN campaigns c ON c.id=s.campaign_id WHERE s.id=? AND s.is_active=1`,
      [stop_id]
    );
    if (!stop) { cleanup(); return bad(res, 'Stop not found', 404); }
    const assigned = await one(
      'SELECT id, stop_ids FROM assignments WHERE campaign_id=? AND driver_id=? AND work_date=CURDATE() AND is_active=1',
      [stop.campaign_id, req.user.id]
    );
    const { today } = await one('SELECT CURDATE() today');
    if (!assigned || stop.campaign_status !== 'active' || today < stop.start_date || today > stop.end_date) {
      cleanup();
      return bad(res, 'This stop is not assigned to you today', 403);
    }
    const splitIds = parseIds(assigned.stop_ids);
    if (splitIds && !splitIds.includes(stop.id)) { cleanup(); return bad(res, 'This stop is not assigned to you today', 403); }

    const vehicle = await currentVehicle(req.user.id);
    if (!vehicle) { cleanup(); return bad(res, "Select today's vehicle first"); }

    // Duplicate photo check via SHA-256 hash
    const fileBuf = fs.readFileSync(req.file.path);
    const fileHash = crypto.createHash('sha256').update(fileBuf).digest('hex');
    const dup = await one('SELECT id FROM photos WHERE file_hash=? LIMIT 1', [fileHash]);
    if (dup) {
      cleanup();
      return bad(res, 'Duplicate photo detected. Take a fresh live photo.', 409);
    }

    // Validated capture timestamp (for offline queue sync)
    let captureSql = 'NOW()';
    let captureArg = [];
    if (taken_at && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(taken_at))) {
      captureSql = '?';
      captureArg = [taken_at];
    }

    const latestVisit = await one(
      'SELECT *, UNIX_TIMESTAMP(arrived_at) arrived_ts FROM visits WHERE stop_id=? AND driver_id=? AND work_date=CURDATE() ORDER BY attempt DESC LIMIT 1',
      [stop.id, req.user.id]
    );

    const acc = isNaN(parseFloat(accuracy)) ? null : parseFloat(accuracy);
    const distance = stop.latitude != null && stop.longitude != null ? haversine(lat, lng, +stop.latitude, +stop.longitude) : null;
    const within = distance == null ? null : (distance <= stop.radius_m ? 1 : 0);

    const flags = [];
    if (within === 0) flags.push(`Outside allowed radius (${distance} m)`);
    if (acc != null && acc > 150) flags.push(`Low GPS accuracy (±${Math.round(acc)} m)`);

    // Fake-GPS / impossible speed jump check against driver's previous photo today
    const prevPhoto = await one(
      `SELECT p.latitude, p.longitude, UNIX_TIMESTAMP(p.taken_at) ts
       FROM photos p JOIN visits vi ON vi.id=p.visit_id
       WHERE vi.driver_id=? AND vi.work_date=CURDATE() ORDER BY p.id DESC LIMIT 1`,
      [req.user.id]
    );
    if (prevPhoto) {
      const dtSec = Math.max(1, Math.floor(Date.now() / 1000) - prevPhoto.ts);
      const jumpM = haversine(lat, lng, +prevPhoto.latitude, +prevPhoto.longitude);
      if (dtSec < 120 && jumpM > 5000) flags.push(`Suspected GPS jump (${Math.round(jumpM / 1000)} km in ${dtSec}s)`);
    }

    let visit = latestVisit;
    let minStayMet = null;
    if (type === 'arrival') {
      if (visit && !(visit.status === 'rejected' && redo === '1')) {
        cleanup();
        return bad(res, 'Arrival photo is already submitted for this stop', 409);
      }
      const nextAttempt = visit ? visit.attempt + 1 : 1;
      const r = await run(
        `INSERT INTO visits (stop_id,stop_name_snap,stop_addr_snap,campaign_id,driver_id,vehicle_id,work_date,attempt,status,arrived_at,flag_reason)
         VALUES (?,?,?,?,?,?,CURDATE(),?,'arrived',${captureSql},?)`,
        [stop.id, stop.name, stop.address || null, stop.campaign_id, req.user.id, vehicle.id, nextAttempt, ...captureArg, flags.join('; ') || null]
      );
      visit = { id: r.insertId, flag_reason: flags.join('; ') || null };
    } else {
      if (!visit) { cleanup(); return bad(res, 'Take the arrival photo first'); }
      if (visit.status !== 'arrived') { cleanup(); return bad(res, 'This visit is already completed', 409); }
      if (type === 'departure') {
        const reqStay = stop.min_stay_min ?? stop.camp_min_stay ?? 0;
        const depEpoch = captureArg.length ? Math.floor(new Date(captureArg[0].replace(' ', 'T') + (process.env.DB_TZ || '+05:30')).getTime() / 1000) : Math.floor(Date.now() / 1000);
        const stayedMin = Math.max(0, Math.floor((depEpoch - visit.arrived_ts) / 60));
        minStayMet = stayedMin >= reqStay ? 1 : 0;
        if (!minStayMet) flags.push(`Short stay (${stayedMin} min < ${reqStay} min)`);
      }
      const combinedFlag = [visit.flag_reason, ...flags].filter(Boolean).join('; ').slice(0, 255) || null;
      if (type === 'departure') {
        await run(
          `UPDATE visits SET status='completed', departed_at=${captureSql}, min_stay_met=?, flag_reason=? WHERE id=?`,
          [...captureArg, minStayMet, combinedFlag, visit.id]
        );
      } else if (flags.length) {
        await run('UPDATE visits SET flag_reason=? WHERE id=?', [combinedFlag, visit.id]);
      }
    }

    const rel = '/uploads/' + path.relative(UPLOAD_DIR, req.file.path).split(path.sep).join('/');
    await run(
      `INSERT INTO photos (visit_id,type,file_path,file_hash,latitude,longitude,accuracy_m,address,distance_m,within_radius,is_flagged,flag_notes,captured_offline,taken_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,${captureSql})`,
      [
        visit.id,
        type,
        rel,
        fileHash,
        lat,
        lng,
        acc,
        (address || '').slice(0, 255) || null,
        distance,
        within,
        flags.length ? 1 : 0,
        flags.join('; ').slice(0, 255) || null,
        captured_offline === '1' ? 1 : 0,
        ...captureArg,
      ]
    );
    res.status(201).json({
      visit_id: visit.id,
      type,
      distance_m: distance,
      within_radius: within === null ? null : !!within,
      min_stay_met: minStayMet === null ? null : !!minStayMet,
      flags,
    });
  } catch (e) {
    cleanup();
    throw e;
  }
}));

module.exports = router;
