const jwt = require('jsonwebtoken');
const { one } = require('./db');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
// Permissions a sub-admin can be given by the Admin
const ALL_PERMS = ['campaigns', 'assign', 'drivers', 'vehicles', 'review', 'reports'];

const parsePerms = (p) => { try { const a = JSON.parse(p || '[]'); return Array.isArray(a) ? a.filter((x) => ALL_PERMS.includes(x)) : []; } catch { return []; } };
const sign = (u) => jwt.sign({ id: u.id, role: u.role }, SECRET, { expiresIn: '12h' });
const publicUser = (u) => ({
  id: u.id, name: u.name, username: u.username, mobile: u.mobile, role: u.role, language: u.language,
  permissions: u.role === 'admin' ? ALL_PERMS : parsePerms(u.permissions),
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const auth = wrap(async (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required' });
  let payload;
  try { payload = jwt.verify(token, SECRET); } catch { return res.status(401).json({ error: 'Session expired, please log in again' }); }
  const user = await one('SELECT * FROM users WHERE id=?', [payload.id]);
  if (!user || !user.is_active) return res.status(401).json({ error: 'Account is inactive' });
  req.user = { ...user, perms: publicUser(user).permissions };
  next();
});

const staff = (req, res, next) => (req.user.role !== 'driver' ? next() : res.status(403).json({ error: 'Not allowed' }));
const driverOnly = (req, res, next) => (req.user.role === 'driver' ? next() : res.status(403).json({ error: 'Drivers only' }));
const adminOnly = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' }));
const need = (perm) => (req, res, next) => (req.user.role === 'admin' || req.user.perms.includes(perm) ? next() : res.status(403).json({ error: 'You do not have permission for this' }));

module.exports = { ALL_PERMS, parsePerms, sign, publicUser, wrap, auth, staff, driverOnly, adminOnly, need };
