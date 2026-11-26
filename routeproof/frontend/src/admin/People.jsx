import { useRef, useState } from 'react';
import { Plus, KeyRound, Upload, Download } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLang } from '../i18n.jsx';
import { Empty, Field, Modal, Spinner, useLoad, useToast } from '../ui.jsx';

const PERMS = [
  ['campaigns', 'Manage campaigns and routes'],
  ['assign', 'Assign drivers'],
  ['drivers', 'Manage drivers'],
  ['vehicles', 'Manage vehicles'],
  ['review', 'Approve or reject photos'],
  ['reports', 'View and export reports'],
];

function PersonForm({ kind, person, onClose, onSaved }) {
  const { t } = useLang();
  const toast = useToast();
  const [f, setF] = useState({ name: '', username: '', mobile: '', permissions: ['campaigns', 'assign', 'review', 'reports'], ...(person || {}), password: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const togglePerm = (p) => setF({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p] });
  const save = async () => {
    setBusy(true);
    try {
      if (person) {
        await api(`/users/${person.id}`, {
          method: 'PATCH',
          body: { name: f.name, mobile: f.mobile, password: f.password || undefined, permissions: kind === 'subadmin' ? f.permissions : undefined },
        });
      } else {
        await api('/users', { method: 'POST', body: { ...f, role: kind } });
      }
      toast(t('Saved'));
      onSaved();
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };
  return (
    <Modal
      title={person ? t('Edit {name}', { name: person.name }) : kind === 'driver' ? t('Add driver') : t('Add sub-admin')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Cancel')}</button>
          <button className="btn primary" disabled={busy || !f.name || (!person && (!f.username || f.password.length < 6))} onClick={save}>{t('Save')}</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('Full name')} full><input className="input" value={f.name} onChange={set('name')} autoFocus /></Field>
        {!person && <Field label={t('Username')}><input className="input" value={f.username} onChange={set('username')} autoCapitalize="none" /></Field>}
        <Field label={t('Mobile number')}><input className="input" inputMode="tel" value={f.mobile || ''} onChange={set('mobile')} /></Field>
        <Field label={person ? t('New password (leave empty to keep)') : t('Password (min 6 characters)')} full>
          <input className="input" type="text" value={f.password} onChange={set('password')} autoComplete="off" />
        </Field>
        {kind === 'subadmin' && (
          <div className="full stack" style={{ gap: 8 }}>
            <b>{t('What can this sub-admin do?')}</b>
            {PERMS.map(([k, label]) => (
              <label key={k} className="check">
                <input type="checkbox" checked={f.permissions.includes(k)} onChange={() => togglePerm(k)} /> {t(label)}
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function People({ kind }) {
  const { t } = useLang();
  const toast = useToast();
  const { can } = useAuth();
  const { data, loading, error, reload } = useLoad(() => api(`/users?role=${kind}`), [kind]);
  const [form, setForm] = useState(null);
  const [search, setSearch] = useState('');
  const fileRef = useRef(null);
  const canEdit = kind === 'subadmin' || can('drivers');

  const toggle = async (p) => {
    try { await api(`/users/${p.id}`, { method: 'PATCH', body: { is_active: !p.is_active } }); reload(); }
    catch (e) { toast(e.message, 'err'); }
  };

  const bulkUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api('/users/bulk', { method: 'POST', form: fd });
      toast(`Imported ${r.added} drivers (${r.skipped} skipped)`);
      reload();
    } catch (err) { toast(err.message, 'err'); }
  };

  const downloadTemplate = () => {
    const csv = 'Name,Username,Mobile,Password\nRamesh Patil,ramesh,9000000099,driver123\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'drivers-template.csv' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const list = (data || []).filter((p) => {
    const q = search.trim().toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q) || (p.mobile || '').includes(q);
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{kind === 'driver' ? t('Drivers') : t('Sub-admins')}</h1>
          <p>{kind === 'driver' ? t('Create drivers once, then assign them to campaigns each day.') : t('Sub-admins help run campaigns. You decide what each one can do.')}</p>
        </div>
        {canEdit && (
          <div className="row wrap">
            {kind === 'driver' && (
              <>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={bulkUpload} />
                <button className="btn sm" onClick={downloadTemplate}><Download size={14} /> {t('Template')}</button>
                <button className="btn sm" onClick={() => fileRef.current.click()}><Upload size={14} /> {t('Import Excel/CSV')}</button>
              </>
            )}
            <button className="btn primary" onClick={() => setForm({})}><Plus size={17} /> {kind === 'driver' ? t('Add driver') : t('Add sub-admin')}</button>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14, maxWidth: 320 }}>
        <input className="input" placeholder={t('Search') + '...'} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card table-wrap">
        {loading ? <Spinner /> : error ? <p className="error-text" style={{ padding: 16 }}>{error}</p> : !list.length ? <Empty title={t('Nobody here yet')} /> : (
          <table>
            <thead>
              <tr>
                <th>{t('Name')}</th><th>{t('Username')}</th><th>{t('Mobile number')}</th>
                {kind === 'subadmin' && <th>{t('Access')}</th>}
                <th>{t('Status')}</th>{canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.name}</b></td>
                  <td className="mono">{p.username}</td>
                  <td className="mono">{p.mobile || '-'}</td>
                  {kind === 'subadmin' && (
                    <td className="small">{p.permissions.map((x) => t(PERMS.find((q) => q[0] === x)?.[1] || x)).join(', ') || '-'}</td>
                  )}
                  <td><span className={`badge ${p.is_active ? 'ok' : ''}`}>{p.is_active ? t('Active') : t('Inactive')}</span></td>
                  {canEdit && (
                    <td className="nowrap right">
                      <button className="btn sm" onClick={() => setForm(p)}><KeyRound size={14} /> {t('Edit')}</button>{' '}
                      <button className="btn sm" onClick={() => toggle(p)}>{p.is_active ? t('Deactivate') : t('Activate')}</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {form && <PersonForm kind={kind} person={form.id ? form : null} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </>
  );
}
