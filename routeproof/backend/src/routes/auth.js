const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { one, q, run } = require('../db');
const { sign, publicUser, wrap, auth } = require('../auth');

// Password login: accepts either username or mobile number
router.post('/auth/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const id = String(username || '').trim();
  if (!id || !password) return res.status(400).json({ error: 'Username or mobile and password are required' });
  const u = await one('SELECT * FROM users WHERE username=? OR mobile=?', [id, id]);
  if (!u || !u.is_active || !(await bcrypt.compare(String(password), u.password_hash))) {
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  res.json({ token: sign(u), user: publicUser(u) });
}));

// Driver/user OTP login: request 6-digit OTP for a registered mobile number
router.post('/auth/otp/request', wrap(async (req, res) => {
  const mobile = String(req.body?.mobile || '').replace(/\D/g, '');
  if (mobile.length < 8) return res.status(400).json({ error: 'Enter a valid mobile number' });
  const u = await one('SELECT id, name, mobile, is_active FROM users WHERE mobile=?', [mobile]);
  if (!u || !u.is_active) return res.status(404).json({ error: 'No active account found for this mobile number' });
  const code = String(crypto.randomInt(100000, 999999));
  await run('INSERT INTO otp_codes (user_id, mobile, code, expires_at) VALUES (?,?,?,DATE_ADD(NOW(), INTERVAL 10 MINUTE))', [u.id, mobile, code]);
  console.log(`[OTP] Mobile ${mobile} -> ${code}`);
  // Demo convenience: return demo_otp when no SMS gateway is configured
  res.json({ ok: true, demo_otp: process.env.HIDE_DEMO_OTP ? undefined : code });
}));

router.post('/auth/otp/verify', wrap(async (req, res) => {
  const mobile = String(req.body?.mobile || '').replace(/\D/g, '');
  const code = String(req.body?.code || '').trim();
  if (!mobile || !code) return res.status(400).json({ error: 'Mobile number and OTP are required' });
  const row = await one(
    'SELECT * FROM otp_codes WHERE mobile=? AND code=? AND used_at IS NULL AND expires_at >= NOW() ORDER BY id DESC LIMIT 1',
    [mobile, code]
  );
  if (!row) return res.status(401).json({ error: 'Invalid or expired OTP' });
  const u = await one('SELECT * FROM users WHERE id=? AND is_active=1', [row.user_id]);
  if (!u) return res.status(401).json({ error: 'Account is inactive' });
  await run('UPDATE otp_codes SET used_at=NOW() WHERE id=?', [row.id]);
  res.json({ token: sign(u), user: publicUser(u) });
}));

router.get('/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

router.patch('/auth/language', auth, wrap(async (req, res) => {
  const language = req.body.language === 'mr' ? 'mr' : 'en';
  await run('UPDATE users SET language=? WHERE id=?', [language, req.user.id]);
  res.json({ language });
}));

// Vehicle list: used by driver popup and admin screens
router.get('/vehicles', auth, wrap(async (req, res) => {
  const all = req.user.role !== 'driver' && req.query.all === '1';
  res.json(await q(`SELECT * FROM vehicles ${all ? '' : 'WHERE is_active=1'} ORDER BY number`));
}));

module.exports = router;
