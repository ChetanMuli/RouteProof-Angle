const router = require('express').Router();
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { q, one } = require('../db');
const { wrap, auth, staff, need } = require('../auth');
const { listVisits, visitFilter } = require('./visits');

const R = [auth, staff, need('reports')];
const hhmm = (s) => (s ? s.slice(11, 16) : '');
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

// Marathi column headers for Excel exports when lang=mr
const MR_HDR = {
  Date: 'तारीख', Advertiser: 'जाहिरातदार', Campaign: 'मोहीम', Stop: 'थांबा', Driver: 'ड्रायव्हर', Vehicle: 'वाहन',
  Arrival: 'आगमन', Departure: 'प्रस्थान', Duration: 'कालावधी', Photos: 'फोटो', Status: 'स्थिती', Flag: 'सूचना',
  'Selected at': 'निवडल्याची वेळ', 'Total visits': 'एकूण भेटी', Approved: 'मंजूर', Rejected: 'नामंजूर',
  'Pending review': 'तपासणी बाकी', Flagged: 'फ्लॅग केलेले', 'Avg stay (min)': 'सरासरी वेळ (मि)',
  '#': 'क्र.', 'Stop name': 'थांब्याचे नाव', Address: 'पत्ता', Latitude: 'अक्षांश', Longitude: 'रेखांश', 'Radius (m)': 'अंतर (मी)',
};

const trCol = (label, lang) => (lang === 'mr' && MR_HDR[label] ? MR_HDR[label] : label);

function sendTable(res, { format, title, subtitle, columns, rows, filename, lang = 'en' }) {
  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    doc.pipe(res);
    const W = doc.page.width - 60, total = columns.reduce((a, c) => a + c.w, 0);
    const widths = columns.map((c) => (c.w / total) * W);
    const header = () => {
      let x = 30; const y = doc.y;
      doc.rect(30, y, W, 22).fill('#0F172A');
      doc.fillColor('#F8FAFC').font('Helvetica-Bold').fontSize(8);
      columns.forEach((c, i) => { doc.text(c.label, x + 5, y + 7, { width: widths[i] - 10, lineBreak: false, ellipsis: true }); x += widths[i]; });
      doc.fillColor('#1E293B').font('Helvetica'); doc.y = y + 24;
    };
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#0F172A').text(title);
    doc.font('Helvetica').fontSize(9).fillColor('#475569').text(subtitle || '').moveDown(0.6);
    header();
    rows.forEach((r, ri) => {
      if (doc.y > doc.page.height - 50) { doc.addPage(); header(); }
      const y = doc.y; let x = 30;
      if (ri % 2) doc.rect(30, y - 2, W, 17).fill('#F1F5F9');
      doc.fillColor('#1E293B').font('Helvetica').fontSize(8);
      columns.forEach((c, i) => { doc.text(String(r[c.key] ?? ''), x + 5, y + 3, { width: widths[i] - 10, lineBreak: false, ellipsis: true }); x += widths[i]; });
      doc.y = y + 17;
    });
    if (!rows.length) doc.fontSize(10).text('No records for the selected filters.');
    doc.end();
    return;
  }
  const labels = columns.map((c) => trCol(c.label, lang));
  const data = rows.map((r) => Object.fromEntries(columns.map((c, idx) => [labels[idx], r[c.key] ?? ''])));
  const ws = XLSX.utils.json_to_sheet(data, { header: labels });
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(10, Math.round(c.w * 1.6)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

const fmt = (req) => (req.query.format === 'pdf' ? 'pdf' : 'xlsx');
const range = (qs) => `Period: ${qs.date_from || 'start'} to ${qs.date_to || 'today'}`;

router.get('/reports/visits', R, wrap(async (req, res) => {
  const rows = (await listVisits(req.query, 5000)).map((v) => ({
    ...v,
    arrival: hhmm(v.arrived_at),
    departure: hhmm(v.departed_at),
    duration: v.duration_min == null ? '' : `${v.duration_min} min`,
    flag: v.flag_reason || (v.outside_count > 0 ? 'Outside radius' : ''),
  }));
  sendTable(res, {
    format: fmt(req),
    lang: req.query.lang === 'mr' ? 'mr' : 'en',
    filename: 'visit-report',
    title: 'RouteProof - Visit Report',
    subtitle: range(req.query),
    rows,
    columns: [
      { key: 'work_date', label: 'Date', w: 9 }, { key: 'advertiser', label: 'Advertiser', w: 12 }, { key: 'campaign_name', label: 'Campaign', w: 14 },
      { key: 'stop_name', label: 'Stop', w: 15 }, { key: 'driver_name', label: 'Driver', w: 11 }, { key: 'vehicle_number', label: 'Vehicle', w: 10 },
      { key: 'arrival', label: 'Arrival', w: 7 }, { key: 'departure', label: 'Departure', w: 7 }, { key: 'duration', label: 'Duration', w: 8 },
      { key: 'photo_count', label: 'Photos', w: 6 }, { key: 'status', label: 'Status', w: 9 }, { key: 'flag', label: 'Flag', w: 13 },
    ],
  });
}));

// Driver-wise, Vehicle-wise, Campaign-wise, or Date-wise Summary Report
router.get('/reports/summary', R, wrap(async (req, res) => {
  const by = ['driver', 'vehicle', 'campaign', 'date'].includes(req.query.group_by) ? req.query.group_by : 'driver';
  const f = visitFilter(req.query);
  const groupSql = {
    driver: { col: 'd.name', label: 'Driver', key: 'grp' },
    vehicle: { col: 'v.number', label: 'Vehicle', key: 'grp' },
    campaign: { col: 'c.name', label: 'Campaign', key: 'grp' },
    date: { col: 'vi.work_date', label: 'Date', key: 'grp' },
  }[by];
  const rows = await q(
    `SELECT ${groupSql.col} AS grp,
            COUNT(*) AS total_visits,
            SUM(vi.status='approved') AS approved,
            SUM(vi.status='rejected') AS rejected,
            SUM(vi.status='completed') AS pending,
            SUM(vi.flag_reason IS NOT NULL) AS flagged,
            ROUND(AVG(TIMESTAMPDIFF(MINUTE, vi.arrived_at, vi.departed_at)), 1) AS avg_stay
     FROM visits vi JOIN campaigns c ON c.id=vi.campaign_id JOIN users d ON d.id=vi.driver_id JOIN vehicles v ON v.id=vi.vehicle_id
     ${f.where}
     GROUP BY ${groupSql.col}
     ORDER BY total_visits DESC`,
    f.params
  );
  sendTable(res, {
    format: fmt(req),
    lang: req.query.lang === 'mr' ? 'mr' : 'en',
    filename: `summary-by-${by}`,
    title: `RouteProof - ${groupSql.label}-wise Summary`,
    subtitle: range(req.query),
    rows,
    columns: [
      { key: 'grp', label: groupSql.label, w: 22 },
      { key: 'total_visits', label: 'Total visits', w: 11 },
      { key: 'approved', label: 'Approved', w: 10 },
      { key: 'pending', label: 'Pending review', w: 12 },
      { key: 'rejected', label: 'Rejected', w: 10 },
      { key: 'flagged', label: 'Flagged', w: 10 },
      { key: 'avg_stay', label: 'Avg stay (min)', w: 12 },
    ],
  });
}));

// Route / Stop list export
router.get('/reports/stops', R, wrap(async (req, res) => {
  const cid = +req.query.campaign_id;
  if (!cid) return res.status(400).json({ error: 'campaign_id is required' });
  const camp = await one('SELECT advertiser, name FROM campaigns WHERE id=?', [cid]);
  if (!camp) return res.status(404).json({ error: 'Campaign not found' });
  const rows = await q('SELECT seq, name, address, latitude, longitude, radius_m FROM stops WHERE campaign_id=? AND is_active=1 ORDER BY seq', [cid]);
  sendTable(res, {
    format: fmt(req),
    lang: req.query.lang === 'mr' ? 'mr' : 'en',
    filename: `route-stops-${cid}`,
    title: `Route Stop List - ${camp.name}`,
    subtitle: `Advertiser: ${camp.advertiser}`,
    rows,
    columns: [
      { key: 'seq', label: '#', w: 6 }, { key: 'name', label: 'Stop name', w: 22 }, { key: 'address', label: 'Address', w: 28 },
      { key: 'latitude', label: 'Latitude', w: 12 }, { key: 'longitude', label: 'Longitude', w: 12 }, { key: 'radius_m', label: 'Radius (m)', w: 10 },
    ],
  });
}));

// Campaign Proof-of-Display PDF with embedded photos (or Excel)
router.get('/reports/campaign/:id', R, wrap(async (req, res) => {
  const camp = await one('SELECT * FROM campaigns WHERE id=?', [req.params.id]);
  if (!camp) return res.status(404).json({ error: 'Campaign not found' });
  const visits = await listVisits({ ...req.query, campaign_id: camp.id }, 500);
  if (fmt(req) === 'xlsx') {
    return sendTable(res, {
      format: 'xlsx',
      lang: req.query.lang === 'mr' ? 'mr' : 'en',
      filename: `campaign-${camp.id}-report`,
      title: camp.name,
      subtitle: camp.advertiser,
      rows: visits.map((v) => ({
        ...v, arrival: hhmm(v.arrived_at), departure: hhmm(v.departed_at),
        duration: v.duration_min == null ? '' : `${v.duration_min} min`,
        flag: v.flag_reason || '',
      })),
      columns: [
        { key: 'work_date', label: 'Date', w: 9 }, { key: 'stop_name', label: 'Stop', w: 16 }, { key: 'driver_name', label: 'Driver', w: 12 },
        { key: 'vehicle_number', label: 'Vehicle', w: 11 }, { key: 'arrival', label: 'Arrival', w: 7 }, { key: 'departure', label: 'Departure', w: 8 },
        { key: 'duration', label: 'Duration', w: 8 }, { key: 'photo_count', label: 'Photos', w: 6 }, { key: 'status', label: 'Status', w: 9 }, { key: 'flag', label: 'Flag', w: 14 },
      ],
    });
  }

  const visitIds = visits.map((v) => v.id);
  const photos = visitIds.length
    ? await q('SELECT visit_id, type, file_path, taken_at, distance_m, within_radius FROM photos WHERE visit_id IN (?) ORDER BY taken_at', [visitIds])
    : [];

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="campaign-${camp.id}-proof-report.pdf"`);
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  doc.pipe(res);
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#0F172A').text(`${camp.name} - Proof of Display`);
  doc.font('Helvetica').fontSize(10).fillColor('#475569')
    .text(`Advertiser: ${camp.advertiser}   |   Period: ${camp.start_date} to ${camp.end_date}   |   Visits: ${visits.length}`)
    .moveDown(1);

  if (!visits.length) {
    doc.fontSize(11).text('No visits recorded for this campaign yet.');
    doc.end();
    return;
  }

  for (const v of visits) {
    if (doc.y > doc.page.height - 220) doc.addPage();
    doc.rect(36, doc.y, doc.page.width - 72, 22).fill('#0F172A');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10)
      .text(`${v.work_date}  |  ${v.stop_name}  |  ${v.driver_name} (${v.vehicle_number})  |  ${v.status.toUpperCase()}`, 44, doc.y + 6, {
        width: doc.page.width - 88,
        lineBreak: false,
        ellipsis: true,
      });
    doc.y += 28;
    doc.fillColor('#334155').font('Helvetica').fontSize(9)
      .text(`Arrived: ${hhmm(v.arrived_at)}   Left: ${hhmm(v.departed_at) || '-'}   Duration: ${v.duration_min != null ? v.duration_min + ' min' : '-'}${v.flag_reason ? '   |   Flag: ' + v.flag_reason : ''}`);
    doc.moveDown(0.5);

    const vPhotos = photos.filter((p) => p.visit_id === v.id).slice(0, 3);
    if (vPhotos.length) {
      const startY = doc.y;
      const boxW = 160, boxH = 110, gap = 12;
      vPhotos.forEach((p, idx) => {
        const x = 36 + idx * (boxW + gap);
        const rel = p.file_path.replace(/^\/uploads\//, '');
        const abs = path.join(UPLOAD_DIR, rel);
        try {
          if (fs.existsSync(abs)) doc.image(abs, x, startY, { fit: [boxW, boxH] });
        } catch {
          doc.rect(x, startY, boxW, boxH).stroke('#CBD5E1');
        }
        doc.fillColor('#475569').fontSize(8).text(`${p.type.toUpperCase()} ${hhmm(p.taken_at)}`, x, startY + boxH + 3, { width: boxW });
      });
      doc.y = startY + boxH + 22;
    } else {
      doc.moveDown(0.5);
    }
  }
  doc.end();
}));

router.get('/reports/vehicle-log', R, wrap(async (req, res) => {
  const w = [], p = [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.date_from || '')) { w.push('l.work_date>=?'); p.push(req.query.date_from); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.date_to || '')) { w.push('l.work_date<=?'); p.push(req.query.date_to); }
  const rows = await q(
    `SELECT l.work_date, d.name driver_name, v.number vehicle_number, c.advertiser, c.name campaign_name, l.selected_at
     FROM driver_vehicle_log l JOIN users d ON d.id=l.driver_id JOIN vehicles v ON v.id=l.vehicle_id LEFT JOIN campaigns c ON c.id=l.campaign_id
     ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY l.work_date DESC, l.id DESC LIMIT 5000`,
    p
  );
  if (req.query.format === 'json') return res.json(rows);
  sendTable(res, {
    format: fmt(req),
    lang: req.query.lang === 'mr' ? 'mr' : 'en',
    filename: 'driver-vehicle-log',
    title: 'Driver and Vehicle Log',
    subtitle: range(req.query),
    rows: rows.map((r) => ({ ...r, selected: hhmm(r.selected_at) })),
    columns: [
      { key: 'work_date', label: 'Date', w: 10 }, { key: 'driver_name', label: 'Driver', w: 16 }, { key: 'vehicle_number', label: 'Vehicle', w: 12 },
      { key: 'advertiser', label: 'Advertiser', w: 16 }, { key: 'campaign_name', label: 'Campaign', w: 18 }, { key: 'selected', label: 'Selected at', w: 9 },
    ],
  });
}));

module.exports = router;
