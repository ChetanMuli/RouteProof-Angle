const router = require('express').Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { q, one, run } = require('../db');
const { ALL_PERMS, parsePerms, wrap, auth, staff, need, adminOnly } = require('../auth');
const { audit } = require('../audit');
const { parseRouteFile, parseDriversFile, parseVehiclesFile } = require('../importer');
const { geocode, geocodeSearch } = require('../geo');

const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const parseIds = (raw) => {
  if (!raw) return null;
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) && a.length ? a.map(Number) : null;
  } catch {
    return null;
  }
};

router.use(auth, staff);

/* ---------------- Dashboard ---------------- */
router.get('/dashboard', wrap(async (req, res) => {
  const n = (v) => Number(v || 0);
  const duty = await one('SELECT COUNT(DISTINCT driver_id) n FROM assignments WHERE work_date=CURDATE() AND is_active=1');
  const veh = await one('SELECT COUNT(DISTINCT vehicle_id) n FROM driver_vehicle_log WHERE work_date=CURDATE()');
  const vs = await one(
    `SELECT COUNT(*) total,
            SUM(status='arrived') arrived,
            SUM(status='completed') awaiting_review,
            SUM(status='approved') approved,
            SUM(status IN ('completed','approved')) completed,
            SUM(status='rejected') rejected,
            SUM(flag_reason IS NOT NULL) flagged
     FROM visits WHERE work_date=CURDATE()`
  );

  // Compute planned visits accurately respecting stop splitting
  const todayAssigns = await q(
    `SELECT a.campaign_id, a.driver_id, a.stop_ids, c.name, c.advertiser,
            (SELECT COUNT(*) FROM stops s WHERE s.campaign_id=c.id AND s.is_active=1) all_stops
     FROM assignments a JOIN campaigns c ON c.id=a.campaign_id
     WHERE a.work_date=CURDATE() AND a.is_active=1 AND c.status='active' AND c.start_date<=CURDATE() AND c.end_date>=CURDATE()`
  );
  let plannedVisits = 0;
  const campMap = new Map();
  for (const a of todayAssigns) {
    const split = parseIds(a.stop_ids);
    const count = split ? split.length : n(a.all_stops);
    plannedVisits += count;
    if (!campMap.has(a.campaign_id)) campMap.set(a.campaign_id, { id: a.campaign_id, name: a.name, advertiser: a.advertiser, planned: 0, drivers: 0 });
    const entry = campMap.get(a.campaign_id);
    entry.planned += count;
    entry.drivers += 1;
  }
  const doneByCamp = await q(
    `SELECT campaign_id, COUNT(DISTINCT CONCAT(driver_id, '-', stop_id)) done
     FROM visits WHERE work_date=CURDATE() AND status IN ('completed','approved') GROUP BY campaign_id`
  );
  const activeCampaigns = [...campMap.values()].map((c) => {
    const d = doneByCamp.find((x) => x.campaign_id === c.id);
    return { ...c, done: n(d?.done) };
  });

  const startedToday = await one('SELECT COUNT(DISTINCT CONCAT(campaign_id,"-",driver_id,"-",stop_id)) n FROM visits WHERE work_date=CURDATE()');
  const missedVisits = Math.max(0, plannedVisits - n(startedToday.n));
  const pending = await one(`SELECT COUNT(*) n FROM visits WHERE status='completed'`);
  const flaggedAll = await one(`SELECT COUNT(*) n FROM visits WHERE status='completed' AND flag_reason IS NOT NULL`);

  const recent = await q(
    `SELECT p.id, p.type, p.file_path, p.taken_at, p.address, p.latitude, p.longitude, p.accuracy_m, p.distance_m, p.within_radius, p.is_flagged,
            vi.id visit_id, vi.status visit_status, COALESCE(vi.stop_name_snap, s.name) stop_name, d.name driver_name, v.number vehicle_number
     FROM photos p JOIN visits vi ON vi.id=p.visit_id JOIN stops s ON s.id=vi.stop_id JOIN users d ON d.id=vi.driver_id JOIN vehicles v ON v.id=vi.vehicle_id
     ORDER BY p.id DESC LIMIT 8`
  );

  res.json({
    drivers_on_duty: n(duty.n),
    vehicles_in_use: n(veh.n),
    planned_visits: plannedVisits,
    missed_visits: missedVisits,
    visits: {
      total: n(vs.total),
      arrived: n(vs.arrived),
      awaiting_review: n(vs.awaiting_review),
      approved: n(vs.approved),
      completed: n(vs.completed),
      rejected: n(vs.rejected),
      flagged: n(vs.flagged),
    },
    awaiting_review: n(pending.n),
    flagged_pending: n(flaggedAll.n),
    active_campaigns: activeCampaigns,
    recent,
  });
}));

/* ---------------- Geo search for map pin picker ---------------- */
router.get('/geo/search', need('campaigns'), wrap(async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (query.length < 2) return res.json([]);
  res.json(await geocodeSearch(query));
}));

/* ---------------- Users (drivers / sub-admins) ---------------- */
router.get('/users', wrap(async (req, res) => {
  const role = req.query.role === 'subadmin' ? 'subadmin' : 'driver';
  if (role === 'subadmin' && req.user.role !== 'admin') return bad(res, 'Admin only', 403);
  const rows = await q('SELECT id,name,username,mobile,role,permissions,is_active,created_at FROM users WHERE role=? ORDER BY name', [role]);
  res.json(rows.map((u) => ({ ...u, permissions: parsePerms(u.permissions) })));
}));

router.post('/users', wrap(async (req, res) => {
  const { name, username, mobile, password, role, permissions } = req.body || {};
  if (!name || !username || !password) return bad(res, 'Name, username and password are required');
  if (String(password).length < 6) return bad(res, 'Password must be at least 6 characters');
  if (role === 'subadmin') { if (req.user.role !== 'admin') return bad(res, 'Only Admin can create sub-admins', 403); }
  else if (role === 'driver') { if (!(req.user.role === 'admin' || req.user.perms.includes('drivers'))) return bad(res, 'You do not have permission to create drivers', 403); }
  else return bad(res, 'Invalid role');
  const perms = role === 'subadmin' ? JSON.stringify((permissions || []).filter((p) => ALL_PERMS.includes(p))) : null;
  const cleanMob = mobile ? String(mobile).replace(/\D/g, '') : null;
  try {
    const r = await run(
      'INSERT INTO users (name,username,mobile,password_hash,role,permissions,created_by) VALUES (?,?,?,?,?,?,?)',
      [name.trim(), username.trim(), cleanMob || null, await bcrypt.hash(String(password), 10), role, perms, req.user.id]
    );
    await audit(req, 'create', 'user', r.insertId, null, null, { role, username: username.trim(), name: name.trim(), mobile: cleanMob });
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return bad(res, 'That username or mobile number is already taken', 409);
    throw e;
  }
}));

router.post('/users/bulk', memUpload.single('file'), wrap(async (req, res) => {
  if (!(req.user.role === 'admin' || req.user.perms.includes('drivers'))) return bad(res, 'You do not have permission to import drivers', 403);
  if (!req.file) return bad(res, 'Choose an Excel or CSV file');
  const list = parseDriversFile(req.file);
  if (!list.length) return bad(res, 'No driver rows found in file');
  let added = 0, skipped = 0;
  for (const d of list.slice(0, 200)) {
    try {
      await run(
        'INSERT INTO users (name,username,mobile,password_hash,role,created_by) VALUES (?,?,?,?,"driver",?)',
        [d.name, d.username, d.mobile, await bcrypt.hash(d.password.length >= 6 ? d.password : 'driver123', 10), req.user.id]
      );
      added += 1;
    } catch {
      skipped += 1;
    }
  }
  await audit(req, 'bulk_import_drivers', 'user', null, { added, skipped });
  res.status(201).json({ added, skipped });
}));

router.patch('/users/:id', wrap(async (req, res) => {
  const target = await one('SELECT * FROM users WHERE id=?', [req.params.id]);
  if (!target || target.role === 'admin') return bad(res, 'User not found', 404);
  if (target.role === 'subadmin' && req.user.role !== 'admin') return bad(res, 'Admin only', 403);
  if (target.role === 'driver' && !(req.user.role === 'admin' || req.user.perms.includes('drivers'))) return bad(res, 'No permission', 403);
  const b = req.body || {}, sets = [], vals = [], oldSnap = {}, newSnap = {};
  if (b.name) { sets.push('name=?'); vals.push(b.name.trim()); oldSnap.name = target.name; newSnap.name = b.name.trim(); }
  if (b.mobile !== undefined) {
    const cleanMob = b.mobile ? String(b.mobile).replace(/\D/g, '') : null;
    sets.push('mobile=?'); vals.push(cleanMob || null); oldSnap.mobile = target.mobile; newSnap.mobile = cleanMob;
  }
  if (b.is_active !== undefined) { sets.push('is_active=?'); vals.push(b.is_active ? 1 : 0); oldSnap.is_active = !!target.is_active; newSnap.is_active = !!b.is_active; }
  if (b.password) {
    if (String(b.password).length < 6) return bad(res, 'Password must be at least 6 characters');
    sets.push('password_hash=?'); vals.push(await bcrypt.hash(String(b.password), 10));
    newSnap.password_reset = true;
  }
  if (b.permissions && target.role === 'subadmin') {
    const np = b.permissions.filter((p) => ALL_PERMS.includes(p));
    sets.push('permissions=?'); vals.push(JSON.stringify(np));
    oldSnap.permissions = parsePerms(target.permissions); newSnap.permissions = np;
  }
  if (!sets.length) return bad(res, 'Nothing to update');
  try {
    await run(`UPDATE users SET ${sets.join(',')} WHERE id=?`, [...vals, target.id]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return bad(res, 'That mobile number is already assigned to another user', 409);
    throw e;
  }
  await audit(req, 'update', 'user', target.id, null, oldSnap, newSnap);
  res.json({ ok: true });
}));

/* ---------------- Vehicles ---------------- */
router.post('/vehicles', need('vehicles'), wrap(async (req, res) => {
  const { number, type, owner } = req.body || {};
  const num = String(number || '').toUpperCase().replace(/\s+/g, '');
  if (num.length < 4) return bad(res, 'Enter a valid vehicle number');
  try {
    const r = await run('INSERT INTO vehicles (number,type,owner) VALUES (?,?,?)', [num, type || null, owner || null]);
    await audit(req, 'create', 'vehicle', r.insertId, null, null, { number: num, type: type || null, owner: owner || null });
    res.status(201).json({ id: r.insertId });
  } catch (e) { if (e.code === 'ER_DUP_ENTRY') return bad(res, 'This vehicle number already exists', 409); throw e; }
}));

router.post('/vehicles/bulk', need('vehicles'), memUpload.single('file'), wrap(async (req, res) => {
  if (!req.file) return bad(res, 'Choose an Excel or CSV file');
  const list = parseVehiclesFile(req.file);
  if (!list.length) return bad(res, 'No vehicle rows found in file');
  let added = 0, skipped = 0;
  for (const v of list.slice(0, 200)) {
    try {
      await run('INSERT INTO vehicles (number,type,owner) VALUES (?,?,?)', [v.number, v.type, v.owner]);
      added += 1;
    } catch {
      skipped += 1;
    }
  }
  await audit(req, 'bulk_import_vehicles', 'vehicle', null, { added, skipped });
  res.status(201).json({ added, skipped });
}));

router.patch('/vehicles/:id', need('vehicles'), wrap(async (req, res) => {
  const old = await one('SELECT number, type, owner, is_active FROM vehicles WHERE id=?', [req.params.id]);
  if (!old) return bad(res, 'Vehicle not found', 404);
  const b = req.body || {};
  await run('UPDATE vehicles SET type=COALESCE(?,type), owner=COALESCE(?,owner), is_active=COALESCE(?,is_active) WHERE id=?',
    [b.type ?? null, b.owner ?? null, b.is_active === undefined ? null : (b.is_active ? 1 : 0), req.params.id]);
  await audit(req, 'update', 'vehicle', +req.params.id, null, old, b);
  res.json({ ok: true });
}));

/* ---------------- Campaigns ---------------- */
router.get('/campaigns', wrap(async (req, res) => {
  const w = [], p = [];
  if (['active', 'paused', 'closed'].includes(req.query.status)) { w.push('c.status=?'); p.push(req.query.status); }
  if (req.query.advertiser) { w.push('c.advertiser LIKE ?'); p.push(`%${req.query.advertiser.trim()}%`); }
  if (req.query.q) { w.push('(c.name LIKE ? OR c.advertiser LIKE ?)'); p.push(`%${req.query.q.trim()}%`, `%${req.query.q.trim()}%`); }
  if (isDate(req.query.date)) { w.push('c.start_date<=? AND c.end_date>=?'); p.push(req.query.date, req.query.date); }
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  res.json(await q(
    `SELECT c.*,
      (SELECT COUNT(*) FROM stops s WHERE s.campaign_id=c.id AND s.is_active=1) stop_count,
      (SELECT COUNT(*) FROM assignments a WHERE a.campaign_id=c.id AND a.work_date=CURDATE() AND a.is_active=1) drivers_today,
      (SELECT COUNT(*) FROM visits vi WHERE vi.campaign_id=c.id) visit_count,
      (SELECT COUNT(*) FROM visits vi WHERE vi.campaign_id=c.id AND vi.status='approved') approved_count
     FROM campaigns c ${where}
     ORDER BY FIELD(c.status,'active','paused','closed'), c.start_date DESC`,
    p
  ));
}));

router.post('/campaigns', need('campaigns'), wrap(async (req, res) => {
  const { advertiser, name, start_date, end_date, photo_interval_min, min_stay_min, notes } = req.body || {};
  if (!advertiser || !name) return bad(res, 'Advertiser and campaign name are required');
  if (!isDate(start_date) || !isDate(end_date) || end_date < start_date) return bad(res, 'Enter valid start and end dates');
  const r = await run(
    'INSERT INTO campaigns (advertiser,name,start_date,end_date,photo_interval_min,min_stay_min,notes,created_by) VALUES (?,?,?,?,?,?,?,?)',
    [advertiser.trim(), name.trim(), start_date, end_date, Math.max(1, +photo_interval_min || 10), Math.max(0, +(min_stay_min ?? 5)), notes || null, req.user.id]
  );
  await audit(req, 'create', 'campaign', r.insertId, null, null, { advertiser, name, start_date, end_date });
  res.status(201).json({ id: r.insertId });
}));

router.get('/campaigns/:id', wrap(async (req, res) => {
  const campaign = await one('SELECT * FROM campaigns WHERE id=?', [req.params.id]);
  if (!campaign) return bad(res, 'Campaign not found', 404);
  const stops = await q('SELECT * FROM stops WHERE campaign_id=? AND is_active=1 ORDER BY seq', [campaign.id]);
  const history = await q(
    `SELECT a.id, a.action, a.old_value, a.new_value, a.details, a.created_at, u.name user_name
     FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
     WHERE (a.entity='campaign' AND a.entity_id=?) OR (a.entity='stop' AND a.entity_id IN (SELECT id FROM stops WHERE campaign_id=?))
     ORDER BY a.id DESC LIMIT 30`,
    [campaign.id, campaign.id]
  );
  res.json({ campaign, stops, history });
}));

router.patch('/campaigns/:id', need('campaigns'), wrap(async (req, res) => {
  const old = await one('SELECT advertiser, name, start_date, end_date, status, photo_interval_min, min_stay_min, notes FROM campaigns WHERE id=?', [req.params.id]);
  if (!old) return bad(res, 'Campaign not found', 404);
  const b = req.body || {};
  const status = ['active', 'paused', 'closed'].includes(b.status) ? b.status : null;
  const sd = isDate(b.start_date) ? b.start_date : null;
  const ed = isDate(b.end_date) ? b.end_date : null;
  if ((sd || ed) && (ed || old.end_date) < (sd || old.start_date)) return bad(res, 'End date must be after start date');
  await run(
    `UPDATE campaigns SET advertiser=COALESCE(?,advertiser), name=COALESCE(?,name),
      start_date=COALESCE(?,start_date), end_date=COALESCE(?,end_date), status=COALESCE(?,status),
      photo_interval_min=COALESCE(?,photo_interval_min), min_stay_min=COALESCE(?,min_stay_min), notes=COALESCE(?,notes) WHERE id=?`,
    [
      b.advertiser ? b.advertiser.trim() : null,
      b.name ? b.name.trim() : null,
      sd,
      ed,
      status,
      b.photo_interval_min ? Math.max(1, +b.photo_interval_min) : null,
      b.min_stay_min !== undefined && b.min_stay_min !== '' ? Math.max(0, +b.min_stay_min) : null,
      b.notes ?? null,
      req.params.id,
    ]
  );
  await audit(req, 'update', 'campaign', +req.params.id, null, old, b);
  res.json({ ok: true });
}));

/* ---------------- Stops (route) ---------------- */
const num = (v) => (v === '' || v === null || v === undefined || isNaN(+v) ? null : +v);

async function addStops(campaignId, stops) {
  const { m } = await one('SELECT COALESCE(MAX(seq),0) m FROM stops WHERE campaign_id=?', [campaignId]);
  let seq = m;
  for (const s of stops) {
    seq += 1;
    await run(
      'INSERT INTO stops (campaign_id,seq,name,address,latitude,longitude,radius_m,min_stay_min,instructions) VALUES (?,?,?,?,?,?,?,?,?)',
      [
        campaignId,
        seq,
        String(s.name).trim().slice(0, 150),
        (s.address || '').slice(0, 255) || null,
        num(s.latitude),
        num(s.longitude),
        Math.max(20, +s.radius_m || 200),
        s.min_stay_min !== undefined && s.min_stay_min !== '' && s.min_stay_min !== null ? Math.max(0, +s.min_stay_min) : null,
        (s.instructions || '').slice(0, 255) || null,
      ]
    );
  }
  await run('UPDATE campaigns SET route_version=route_version+1 WHERE id=?', [campaignId]);
  return stops.length;
}

router.post('/campaigns/:id/stops', need('campaigns'), wrap(async (req, res) => {
  if (!req.body?.name) return bad(res, 'Stop name is required');
  await addStops(req.params.id, [req.body]);
  await audit(req, 'add_stop', 'campaign', +req.params.id, null, null, { name: req.body.name, address: req.body.address || null });
  res.status(201).json({ ok: true });
}));

router.post('/campaigns/:id/stops/bulk', need('campaigns'), wrap(async (req, res) => {
  const stops = (req.body?.stops || []).filter((s) => s && String(s.name || '').trim());
  if (!stops.length) return bad(res, 'No stops to save');
  const n = await addStops(req.params.id, stops);
  await audit(req, 'import_stops', 'campaign', +req.params.id, { source: req.body.source || 'import' }, null, { count: n });
  res.status(201).json({ saved: n });
}));

router.post('/campaigns/:id/import/preview', need('campaigns'), memUpload.single('file'), wrap(async (req, res) => {
  if (!req.file) return bad(res, 'Choose a file to import');
  let stops;
  try { stops = await parseRouteFile(req.file); } catch (e) { return bad(res, e.status ? e.message : 'Could not read this file. Try an Excel/CSV file or add stops manually.'); }
  if (!stops.length) return bad(res, 'No stops found in this file. Check the format or add stops manually.');
  stops = stops.slice(0, 200);
  if (req.query.geocode === '1') {
    let done = 0;
    for (const s of stops) {
      if (s.latitude != null || done >= 20) continue;
      const g = await geocode(s.address || s.name);
      if (g) Object.assign(s, g);
      done += 1;
      await new Promise((r) => setTimeout(r, 1100));
    }
  }
  res.json({ stops: stops.map((s) => ({ ...s, warn: s.latitude == null || s.longitude == null ? 'No GPS location' : null })) });
}));

router.patch('/stops/:id', need('campaigns'), wrap(async (req, res) => {
  const old = await one('SELECT id, campaign_id, name, address, latitude, longitude, radius_m, min_stay_min, instructions FROM stops WHERE id=?', [req.params.id]);
  if (!old) return bad(res, 'Stop not found', 404);
  const b = req.body || {};
  const lat = b.latitude !== undefined ? num(b.latitude) : old.latitude;
  const lng = b.longitude !== undefined ? num(b.longitude) : old.longitude;
  const stay = b.min_stay_min !== undefined ? (b.min_stay_min === '' || b.min_stay_min === null ? null : Math.max(0, +b.min_stay_min)) : old.min_stay_min;
  await run(
    `UPDATE stops SET name=COALESCE(?,name), address=COALESCE(?,address), latitude=?, longitude=?,
      radius_m=COALESCE(?,radius_m), min_stay_min=?, instructions=COALESCE(?,instructions) WHERE id=?`,
    [b.name ? b.name.trim() : null, b.address ?? null, lat, lng, b.radius_m ? Math.max(20, +b.radius_m) : null, stay, b.instructions ?? null, req.params.id]
  );
  await run('UPDATE campaigns SET route_version=route_version+1 WHERE id=?', [old.campaign_id]);
  await audit(req, 'update', 'stop', +req.params.id, { campaign_id: old.campaign_id }, old, b);
  res.json({ ok: true });
}));

router.delete('/stops/:id', need('campaigns'), wrap(async (req, res) => {
  const old = await one('SELECT id, campaign_id, name FROM stops WHERE id=?', [req.params.id]);
  if (!old) return bad(res, 'Stop not found', 404);
  await run('UPDATE stops SET is_active=0 WHERE id=?', [req.params.id]);
  await run('UPDATE campaigns SET route_version=route_version+1 WHERE id=?', [old.campaign_id]);
  await audit(req, 'remove', 'stop', +req.params.id, { campaign_id: old.campaign_id }, { name: old.name, is_active: true }, { is_active: false });
  res.json({ ok: true });
}));

router.post('/campaigns/:id/stops/reorder', need('campaigns'), wrap(async (req, res) => {
  const ids = (req.body?.ids || []).map(Number).filter(Boolean);
  for (let i = 0; i < ids.length; i++) await run('UPDATE stops SET seq=? WHERE id=? AND campaign_id=?', [i + 1, ids[i], req.params.id]);
  await run('UPDATE campaigns SET route_version=route_version+1 WHERE id=?', [req.params.id]);
  await audit(req, 'reorder_stops', 'campaign', +req.params.id, null, null, { order: ids });
  res.json({ ok: true });
}));

/* ---------------- Driver assignment (per campaign, per day, with stop splitting) ---------------- */
router.get('/campaigns/:id/assignments', wrap(async (req, res) => {
  const date = isDate(req.query.date) ? req.query.date : (await one('SELECT CURDATE() d')).d;
  const rows = await q(
    `SELECT u.id, u.name, u.mobile, (a.id IS NOT NULL AND a.is_active=1) assigned, a.stop_ids,
      (SELECT v.number FROM driver_vehicle_log l JOIN vehicles v ON v.id=l.vehicle_id WHERE l.driver_id=u.id AND l.work_date=? ORDER BY l.id DESC LIMIT 1) vehicle_number
     FROM users u LEFT JOIN assignments a ON a.driver_id=u.id AND a.campaign_id=? AND a.work_date=?
     WHERE u.role='driver' AND u.is_active=1 ORDER BY u.name`,
    [date, req.params.id, date]
  );
  res.json({
    date,
    drivers: rows.map((r) => ({ ...r, assigned: !!r.assigned, stop_ids: parseIds(r.stop_ids) })),
  });
}));

router.put('/campaigns/:id/assignments', need('assign'), wrap(async (req, res) => {
  const { date, driver_ids, assignments } = req.body || {};
  if (!isDate(date)) return bad(res, 'Choose a date');

  // Accept either [{ driver_id, stop_ids }] or legacy driver_ids array
  const list = Array.isArray(assignments)
    ? assignments.map((a) => ({
        driver_id: Number(a.driver_id),
        stop_ids: Array.isArray(a.stop_ids) && a.stop_ids.length ? a.stop_ids.map(Number).filter(Boolean) : null,
      })).filter((a) => a.driver_id)
    : (driver_ids || []).map((id) => ({ driver_id: Number(id), stop_ids: null })).filter((a) => a.driver_id);

  const prev = await q('SELECT driver_id, stop_ids FROM assignments WHERE campaign_id=? AND work_date=? AND is_active=1', [req.params.id, date]);
  // Soft-deactivate removed assignments rather than hard-deleting history
  const ids = list.map((x) => x.driver_id);
  if (ids.length) {
    await run('UPDATE assignments SET is_active=0 WHERE campaign_id=? AND work_date=? AND driver_id NOT IN (?)', [req.params.id, date, ids]);
  } else {
    await run('UPDATE assignments SET is_active=0 WHERE campaign_id=? AND work_date=?', [req.params.id, date]);
  }
  for (const item of list) {
    const sJson = item.stop_ids ? JSON.stringify(item.stop_ids) : null;
    await run(
      `INSERT INTO assignments (campaign_id,driver_id,work_date,stop_ids,is_active,created_by)
       VALUES (?,?,?,?,1,?)
       ON DUPLICATE KEY UPDATE stop_ids=VALUES(stop_ids), is_active=1`,
      [req.params.id, item.driver_id, date, sJson, req.user.id]
    );
  }
  await audit(req, 'assign_drivers', 'campaign', +req.params.id, { date }, prev, list);
  res.json({ ok: true, count: list.length });
}));

/* ---------------- Activity log ---------------- */
router.get('/audit', adminOnly, wrap(async (req, res) => {
  const w = [], p = [];
  if (req.query.entity) { w.push('a.entity=?'); p.push(req.query.entity); }
  if (+req.query.user_id) { w.push('a.user_id=?'); p.push(+req.query.user_id); }
  if (req.query.q) { w.push('(a.action LIKE ? OR a.details LIKE ? OR a.new_value LIKE ?)'); const lk = `%${req.query.q.trim()}%`; p.push(lk, lk, lk); }
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  res.json(
    await q(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.old_value, a.new_value, a.details, a.created_at, u.name user_name
       FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ${where} ORDER BY a.id DESC LIMIT 300`,
      p
    )
  );
}));

module.exports = router;
