require('dotenv').config();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pool, run } = require('./db');

// Pure-Node minimal PNG generator for seeded sample proof images (works in browser + pdfkit)
function makeSamplePng(rgbTop, rgbPanel) {
  const w = 320, h = 240;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const rowStart = y * (w * 3 + 1);
    raw[rowStart] = 0; // filter none
    const inPanel = y >= 170;
    const inStripe = y >= 166 && y < 170;
    for (let x = 0; x < w; x++) {
      const px = rowStart + 1 + x * 3;
      const [r, g, b] = inStripe
        ? [245, 158, 11]
        : inPanel
        ? rgbPanel
        : [
            Math.max(0, Math.min(255, rgbTop[0] + Math.round((x / w) * 28 - (y / h) * 18))),
            Math.max(0, Math.min(255, rgbTop[1] + Math.round((x / w) * 18 - (y / h) * 12))),
            Math.max(0, Math.min(255, rgbTop[2] + Math.round((y / h) * 24))),
          ];
      raw[px] = r; raw[px + 1] = g; raw[px + 2] = b;
    }
  }
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const t = Buffer.from(type);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.concat([t, data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcBuf), 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function writeSamplePhoto(relPath, rgbTop) {
  const full = path.join(__dirname, '..', 'uploads', relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const buf = makeSamplePng(rgbTop, [15, 23, 42]);
  fs.writeFileSync(full, buf);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

(async () => {
  const hash = (p) => bcrypt.hashSync(p, 10);
  const user = async (name, username, mobile, pw, role, perms) =>
    (await run(
      'INSERT INTO users (name,username,mobile,password_hash,role,permissions) VALUES (?,?,?,?,?,?)',
      [name, username, mobile, hash(pw), role, perms ? JSON.stringify(perms) : null]
    )).insertId;

  const adminId = await user('Vikram Deshmukh', 'admin', '9000000001', 'admin123', 'admin');
  await user('Priya Kulkarni', 'priya', '9000000002', 'priya123', 'subadmin', ['campaigns', 'assign', 'drivers', 'vehicles', 'review', 'reports']);
  const d1 = await user('Ravi Jadhav', 'ravi', '9000000011', 'driver123', 'driver');
  const d2 = await user('Sunil Pawar', 'sunil', '9000000012', 'driver123', 'driver');
  const d3 = await user('Amit Shinde', 'amit', '9000000013', 'driver123', 'driver');

  const vehIds = [];
  for (const [n, t, o] of [
    ['MH12AB1234', 'Tempo', 'City Wheels'],
    ['MH14CD5678', 'Mini truck', 'City Wheels'],
    ['MH12EF9012', 'Van', 'Rapid Logistics'],
    ['MH15GH3456', 'Auto rickshaw', 'Own'],
  ]) {
    const r = await run('INSERT INTO vehicles (number,type,owner) VALUES (?,?,?)', [n, t, o]);
    vehIds.push(r.insertId);
  }

  const camp = async (adv, name, interval, minStay, notes, status = 'active') =>
    (await run(
      'INSERT INTO campaigns (advertiser,name,start_date,end_date,status,photo_interval_min,min_stay_min,notes,created_by) VALUES (?,?,DATE_SUB(CURDATE(),INTERVAL 3 DAY),DATE_ADD(CURDATE(),INTERVAL 20 DAY),?,?,?,?,?)',
      [adv, name, status, interval, minStay, notes, adminId]
    )).insertId;

  const c1 = await camp('Sunrise Electronics', 'Festive Offer Van Tour', 10, 5, 'Park in visible main-road bay; keep rear LED banner clean and unobstructed in every photo.');
  const c2 = await camp('Greenleaf Organics', 'Weekend Market Promotion', 15, 10, 'Engage near morning market gates; capture crowd-side wrap view.');

  const stops = [
    [c1, 'Shaniwar Wada', 'Shaniwar Peth, Pune', 18.5195, 73.8553, 250, 'Park opposite main entrance gate'],
    [c1, 'Pune Railway Station', 'Agarkar Nagar, Pune', 18.5287, 73.8743, 250, 'Station taxi bay side'],
    [c1, 'Koregaon Park', 'North Main Road, Koregaon Park, Pune', 18.5362, 73.8940, 250, 'Near Lane 5 junction'],
    [c1, 'Phoenix Marketcity', 'Viman Nagar, Pune', 18.5622, 73.9167, 250, 'Mall frontage main road'],
    [c1, 'Hinjewadi IT Park', 'Phase 1, Hinjewadi, Pune', 18.5912, 73.7389, 250, 'Wipro circle layby'],
    [c2, 'Swargate Bus Stand', 'Swargate, Pune', 18.5018, 73.8636, 250, null],
    [c2, 'Kothrud Depot', 'Kothrud, Pune', 18.5074, 73.8077, 250, null],
  ];
  const seqs = {};
  const c1StopIds = [];
  const c2StopIds = [];
  for (const [c, name, addr, lat, lng, rad, instr] of stops) {
    seqs[c] = (seqs[c] || 0) + 1;
    const r = await run(
      'INSERT INTO stops (campaign_id,seq,name,address,latitude,longitude,radius_m,instructions) VALUES (?,?,?,?,?,?,?,?)',
      [c, seqs[c], name, addr, lat, lng, rad, instr]
    );
    if (c === c1) c1StopIds.push(r.insertId);
    else c2StopIds.push(r.insertId);
  }

  // Yesterday's assignments, vehicle logs, and sample visits + proof photos (so history, reports & dashboard work immediately)
  await run('INSERT INTO assignments (campaign_id,driver_id,work_date,created_by) VALUES (?,?,DATE_SUB(CURDATE(),INTERVAL 1 DAY),?)', [c1, d1, adminId]);
  await run('INSERT INTO assignments (campaign_id,driver_id,work_date,created_by) VALUES (?,?,DATE_SUB(CURDATE(),INTERVAL 1 DAY),?)', [c1, d2, adminId]);
  await run('INSERT INTO driver_vehicle_log (work_date,driver_id,vehicle_id,campaign_id,selected_at) VALUES (DATE_SUB(CURDATE(),INTERVAL 1 DAY),?,?,?,DATE_SUB(NOW(),INTERVAL 25 HOUR))', [d1, vehIds[0], c1]);
  await run('INSERT INTO driver_vehicle_log (work_date,driver_id,vehicle_id,campaign_id,selected_at) VALUES (DATE_SUB(CURDATE(),INTERVAL 1 DAY),?,?,?,DATE_SUB(NOW(),INTERVAL 24 HOUR))', [d2, vehIds[1], c1]);

  // Seed 2 completed/approved historical visits from yesterday + 1 awaiting review
  const h1 = writeSamplePhoto('seed/shaniwar-arr.png', [36, 99, 135]);
  const h2 = writeSamplePhoto('seed/shaniwar-dep.png', [24, 118, 92]);
  const h3 = writeSamplePhoto('seed/station-arr.png', [107, 74, 42]);
  const h4 = writeSamplePhoto('seed/station-dep.png', [95, 62, 54]);

  const v1 = (await run(
    `INSERT INTO visits (stop_id,stop_name_snap,stop_addr_snap,campaign_id,driver_id,vehicle_id,work_date,attempt,status,arrived_at,departed_at,min_stay_met,reviewed_by,reviewed_at)
     VALUES (?,?,?,?,?,?,DATE_SUB(CURDATE(),INTERVAL 1 DAY),1,'approved',DATE_SUB(NOW(),INTERVAL 24 HOUR),DATE_SUB(NOW(),INTERVAL 23 HOUR),1,?,DATE_SUB(NOW(),INTERVAL 20 HOUR))`,
    [c1StopIds[0], 'Shaniwar Wada', 'Shaniwar Peth, Pune', c1, d1, vehIds[0], adminId]
  )).insertId;
  await run(
    `INSERT INTO photos (visit_id,type,file_path,file_hash,latitude,longitude,accuracy_m,address,distance_m,within_radius,taken_at)
     VALUES (?,'arrival','/uploads/seed/shaniwar-arr.png',?,18.5196,73.8554,12,'Shaniwar Peth, Pune',15,1,DATE_SUB(NOW(),INTERVAL 24 HOUR))`,
    [v1, h1]
  );
  await run(
    `INSERT INTO photos (visit_id,type,file_path,file_hash,latitude,longitude,accuracy_m,address,distance_m,within_radius,taken_at)
     VALUES (?,'departure','/uploads/seed/shaniwar-dep.png',?,18.5195,73.8552,10,'Shaniwar Peth, Pune',11,1,DATE_SUB(NOW(),INTERVAL 23 HOUR))`,
    [v1, h2]
  );

  const v2 = (await run(
    `INSERT INTO visits (stop_id,stop_name_snap,stop_addr_snap,campaign_id,driver_id,vehicle_id,work_date,attempt,status,arrived_at,departed_at,min_stay_met,flag_reason)
     VALUES (?,?,?,?,?,?,DATE_SUB(CURDATE(),INTERVAL 1 DAY),1,'completed',DATE_SUB(NOW(),INTERVAL 22 HOUR),DATE_SUB(NOW(),INTERVAL 21 HOUR),1,'Outside allowed radius (390 m)')`,
    [c1StopIds[1], 'Pune Railway Station', 'Agarkar Nagar, Pune', c1, d2, vehIds[1]]
  )).insertId;
  await run(
    `INSERT INTO photos (visit_id,type,file_path,file_hash,latitude,longitude,accuracy_m,address,distance_m,within_radius,is_flagged,flag_notes,taken_at)
     VALUES (?,'arrival','/uploads/seed/station-arr.png',?,18.5315,73.8765,18,'Station Road, Agarkar Nagar, Pune',390,0,1,'Outside allowed radius (390 m)',DATE_SUB(NOW(),INTERVAL 22 HOUR))`,
    [v2, h3]
  );
  await run(
    `INSERT INTO photos (visit_id,type,file_path,file_hash,latitude,longitude,accuracy_m,address,distance_m,within_radius,taken_at)
     VALUES (?,'departure','/uploads/seed/station-dep.png',?,18.5289,73.8745,14,'Agarkar Nagar, Pune',31,1,DATE_SUB(NOW(),INTERVAL 21 HOUR))`,
    [v2, h4]
  );

  // Today's assignments: ravi + sunil on Campaign 1 (all stops), amit on Campaign 2
  for (const d of [d1, d2]) {
    await run('INSERT INTO assignments (campaign_id,driver_id,work_date,created_by) VALUES (?,?,CURDATE(),?)', [c1, d, adminId]);
  }
  await run('INSERT INTO assignments (campaign_id,driver_id,work_date,created_by) VALUES (?,?,CURDATE(),?)', [c2, d3, adminId]);

  await run(
    'INSERT INTO audit_log (user_id,action,entity,entity_id,new_value,details) VALUES (?,?,?,?,?,?)',
    [adminId, 'seed_setup', 'campaign', c1, JSON.stringify({ name: 'Festive Offer Van Tour', stops: 5 }), JSON.stringify({ note: 'Initial demo dataset created' })]
  );

  console.log('Seed done. Logins: admin/admin123, priya/priya123 (sub-admin), ravi/driver123, sunil/driver123, amit/driver123 (drivers)');
  await pool.end();
})().catch((e) => {
  console.error('Seed failed:', e.message);
  process.exit(1);
});
