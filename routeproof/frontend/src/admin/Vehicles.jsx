import { useRef, useState } from 'react';
import { Plus, Upload, Download } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLang } from '../i18n.jsx';
import { Empty, Field, Modal, Spinner, useLoad, useToast } from '../ui.jsx';

export default function Vehicles() {
  const { t } = useLang();
  const toast = useToast();
  const { can } = useAuth();
  const { data, loading, error, reload } = useLoad(() => api('/vehicles?all=1'));
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const fileRef = useRef(null);

  const save = async () => {
    setBusy(true);
    try {
      await api('/vehicles', { method: 'POST', body: form });
      toast(t('Vehicle added'));
      setForm(null);
      reload();
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };

  const toggle = async (v) => {
    try { await api(`/vehicles/${v.id}`, { method: 'PATCH', body: { is_active: !v.is_active } }); reload(); }
    catch (e) { toast(e.message, 'err'); }
  };

  const bulkUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api('/vehicles/bulk', { method: 'POST', form: fd });
      toast(`Imported ${r.added} vehicles (${r.skipped} skipped)`);
      reload();
    } catch (err) { toast(err.message, 'err'); }
  };

  const downloadTemplate = () => {
    const csv = 'Number,Type,Owner\nMH12XY4321,Van,City Wheels\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'vehicles-template.csv' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const canEdit = can('vehicles');
  const list = (data || []).filter((v) => {
    const q = search.trim().toLowerCase();
    return !q || v.number.toLowerCase().includes(q) || (v.type || '').toLowerCase().includes(q) || (v.owner || '').toLowerCase().includes(q);
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Vehicles')}</h1>
          <p>{t('Drivers pick their vehicle from this list every morning.')}</p>
        </div>
        {canEdit && (
          <div className="row wrap">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={bulkUpload} />
            <button className="btn sm" onClick={downloadTemplate}><Download size={14} /> {t('Template')}</button>
            <button className="btn sm" onClick={() => fileRef.current.click()}><Upload size={14} /> {t('Import Excel/CSV')}</button>
            <button className="btn primary" onClick={() => setForm({ number: '', type: '', owner: '' })}><Plus size={17} /> {t('Add vehicle')}</button>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14, maxWidth: 320 }}>
        <input className="input" placeholder={t('Search vehicle number')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card table-wrap">
        {loading ? <Spinner /> : error ? <p className="error-text" style={{ padding: 16 }}>{error}</p> : !list.length ? <Empty title={t('No vehicles yet')} /> : (
          <table>
            <thead><tr><th>{t('Vehicle number')}</th><th>{t('Type')}</th><th>{t('Owner')}</th><th>{t('Status')}</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {list.map((v) => (
                <tr key={v.id}>
                  <td><b className="mono" style={{ letterSpacing: '.04em', fontSize: 14 }}>{v.number}</b></td>
                  <td>{v.type || '-'}</td>
                  <td>{v.owner || '-'}</td>
                  <td><span className={`badge ${v.is_active ? 'ok' : ''}`}>{v.is_active ? t('Active') : t('Inactive')}</span></td>
                  {canEdit && <td className="right"><button className="btn sm" onClick={() => toggle(v)}>{v.is_active ? t('Deactivate') : t('Activate')}</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {form && (
        <Modal
          title={t('Add vehicle')}
          onClose={() => setForm(null)}
          footer={
            <>
              <button className="btn" onClick={() => setForm(null)}>{t('Cancel')}</button>
              <button className="btn primary" disabled={busy || form.number.length < 4} onClick={save}>{t('Save')}</button>
            </>
          }
        >
          <div className="form-grid">
            <Field label={t('Vehicle number')} full><input className="input" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="MH12AB1234" autoFocus /></Field>
            <Field label={t('Type')}><input className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="Tempo" /></Field>
            <Field label={t('Owner')}><input className="input" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}
