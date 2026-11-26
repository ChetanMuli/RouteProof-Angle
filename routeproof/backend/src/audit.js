const { run } = require('./db');

const clip = (v) => (v === undefined || v === null ? null : (typeof v === 'string' ? v : JSON.stringify(v)).slice(0, 2000));

// Every create / change / review is recorded permanently: who, what, old->new, when
async function audit(req, action, entity, entityId, details = null, oldValue = null, newValue = null) {
  try {
    await run(
      'INSERT INTO audit_log (user_id, action, entity, entity_id, old_value, new_value, details) VALUES (?,?,?,?,?,?,?)',
      [req?.user?.id || null, action, entity, entityId || null, clip(oldValue), clip(newValue), clip(details)]
    );
  } catch (e) {
    console.error('audit failed', e.message);
  }
}

module.exports = { audit };
