const router = require('express').Router();
const { q, one, run } = require('../db');
const { wrap, auth, staff, need } = require('../auth');
const { audit } = require('../audit');

const S = [auth, staff];

function visitFilter(qs) {
  const w = [], p = [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(qs.date_from || '')) { w.push('vi.work_date>=?'); p.push(qs.date_from); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(qs.date_to || '')) { w.push('vi.work_date<=?'); p.push(qs.date_to); }
  if (+qs.campaign_id) { w.push('vi.campaign_id=?'); p.push(+qs.campaign_id); }
  if (+qs.driver_id) { w.push('vi.driver_id=?'); p.push(+qs.driver_id); }
  if (+qs.vehicle_id) { w.push('vi.vehicle_id=?'); p.push(+qs.vehicle_id); }
  if (['arrived', 'completed', 'approved', 'rejected'].includes(qs.status)) { w.push('vi.status=?'); p.push(qs.status); }
  if (qs.flagged === '1') { w.push('(vi.flag_reason IS NOT NULL OR EXISTS (SELECT 1 FROM photos p WHERE p.visit_id=vi.id AND p.is_flagged=1))'); }
  return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
}

const VISIT_SELECT = `SELECT vi.id, vi.work_date, vi.attempt, vi.status, vi.arrived_at, vi.departed_at, vi.min_stay_met, vi.flag_reason, vi.review_reason,
  TIMESTAMPDIFF(MINUTE, vi.arrived_at, vi.departed_at) duration_min,
  COALESCE(vi.stop_name_snap, s.name) stop_name, COALESCE(vi.stop_addr_snap, s.address) stop_address, s.seq stop_seq,
  c.id campaign_id, c.name campaign_name, c.advertiser, c.min_stay_min,
  d.id driver_id, d.name driver_name, v.id vehicle_id, v.number vehicle_number,
  (SELECT COUNT(*) FROM photos p WHERE p.visit_id=vi.id) photo_count,
  (SELECT COALESCE(SUM(p.within_radius=0),0) FROM photos p WHERE p.visit_id=vi.id) outside_count,
  (SELECT COALESCE(SUM(p.is_flagged=1),0) FROM photos p WHERE p.visit_id=vi.id) flagged_count
  FROM visits vi JOIN stops s ON s.id=vi.stop_id JOIN campaigns c ON c.id=vi.campaign_id
  JOIN users d ON d.id=vi.driver_id JOIN vehicles v ON v.id=vi.vehicle_id`;

async function listVisits(qs, limit = 500) {
  const f = visitFilter(qs);
  return q(`${VISIT_SELECT} ${f.where} ORDER BY vi.work_date DESC, vi.arrived_at DESC LIMIT ${+limit}`, f.params);
}

router.get('/visits', S, wrap(async (req, res) => res.json(await listVisits(req.query))));

router.get('/visits/:id', S, wrap(async (req, res) => {
  const visit = await one(`${VISIT_SELECT} WHERE vi.id=?`, [req.params.id]);
  if (!visit) return res.status(404).json({ error: 'Visit not found' });
  const photos = await q(
    'SELECT id,type,file_path,latitude,longitude,accuracy_m,address,distance_m,within_radius,is_flagged,flag_notes,captured_offline,taken_at FROM photos WHERE visit_id=? ORDER BY taken_at',
    [visit.id]
  );
  const stop = await one('SELECT address, latitude, longitude, radius_m FROM stops WHERE id=(SELECT stop_id FROM visits WHERE id=?)', [visit.id]);
  res.json({ visit, photos, stop });
}));

router.patch('/visits/:id/review', S, need('review'), wrap(async (req, res) => {
  const { status, reason } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Choose approve or reject' });
  if (status === 'rejected' && !String(reason || '').trim()) return res.status(400).json({ error: 'Add a reason for rejecting' });
  const v = await one('SELECT status, review_reason FROM visits WHERE id=?', [req.params.id]);
  if (!v) return res.status(404).json({ error: 'Visit not found' });
  if (v.status === 'arrived') return res.status(400).json({ error: 'The driver has not finished this visit yet' });
  const cleanReason = status === 'rejected' ? reason.trim().slice(0, 255) : null;
  await run('UPDATE visits SET status=?, review_reason=?, reviewed_by=?, reviewed_at=NOW() WHERE id=?', [status, cleanReason, req.user.id, req.params.id]);
  await audit(
    req,
    status === 'approved' ? 'approve_visit' : 'reject_visit',
    'visit',
    +req.params.id,
    { reason: cleanReason },
    { status: v.status, review_reason: v.review_reason },
    { status, review_reason: cleanReason }
  );
  res.json({ ok: true });
}));

module.exports = router;
module.exports.listVisits = listVisits;
module.exports.visitFilter = visitFilter;
