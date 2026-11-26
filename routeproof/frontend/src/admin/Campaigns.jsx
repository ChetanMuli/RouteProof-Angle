import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLang } from '../i18n.jsx';
import { Empty, Field, Modal, Spinner, StatusBadge, useLoad, useToast } from '../ui.jsx';
import { addDays, localISO } from '../utils.js';

function NewCampaign({ onClose, onSaved }) {
  const { t } = useLang();
  const toast = useToast();
  const [f, setF] = useState({
    advertiser: '',
    name: '',
    start_date: localISO(),
    end_date: addDays(localISO(), 14),
    photo_interval_min: 10,
    min_stay_min: 5,
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      const r = await api('/campaigns', { method: 'POST', body: f });
      toast(t('Campaign created'));
      onSaved(r.id);
    } catch (e) {
      toast(e.message, 'err');
      setBusy(false);
    }
  };
  return (
    <Modal
      title={t('New campaign')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Cancel')}</button>
          <button className="btn primary" disabled={busy || !f.advertiser.trim() || !f.name.trim()} onClick={save}>
            {t('Create campaign')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('Advertiser (client name)')} full>
          <input className="input" value={f.advertiser} onChange={set('advertiser')} autoFocus />
        </Field>
        <Field label={t('Campaign name')} full>
          <input className="input" value={f.name} onChange={set('name')} />
        </Field>
        <Field label={t('Start date')}>
          <input className="input" type="date" value={f.start_date} onChange={set('start_date')} />
        </Field>
        <Field label={t('End date')}>
          <input className="input" type="date" value={f.end_date} onChange={set('end_date')} />
        </Field>
        <Field label={t('Photo every (minutes) while at a stop')}>
          <input className="input" type="number" min="1" value={f.photo_interval_min} onChange={set('photo_interval_min')} />
        </Field>
        <Field label={t('Minimum stay at each stop (minutes)')}>
          <input className="input" type="number" min="0" value={f.min_stay_min} onChange={set('min_stay_min')} />
        </Field>
        <Field label={t('Notes for drivers')} full>
          <textarea className="input" value={f.notes} onChange={set('notes')} />
        </Field>
      </div>
    </Modal>
  );
}

export default function Campaigns() {
  const { t, fmtDate } = useLang();
  const { can } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ q: '', status: '', date: '' });
  const { data, loading, error } = useLoad(() => api('/campaigns' + qs(f)), [JSON.stringify(f)]);
  const [adding, setAdding] = useState(false);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Campaigns')}</h1>
          <p>{t('One campaign per advertiser job, with its route and drivers.')}</p>
        </div>
        {can('campaigns') && (
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Plus size={17} /> {t('New campaign')}
          </button>
        )}
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
          <Field label={t('Search')}>
            <input className="input" placeholder="Advertiser or campaign name..." value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          </Field>
          <Field label={t('Status')}>
            <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="">{t('All')}</option>
              <option value="active">{t('Active')}</option>
              <option value="paused">{t('Paused')}</option>
              <option value="closed">{t('Closed')}</option>
            </select>
          </Field>
          <Field label={t('Date')}>
            <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
        </div>
      </div>

      <div className="card table-wrap">
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <p className="error-text" style={{ padding: 16 }}>{error}</p>
        ) : !data.length ? (
          <Empty title={t('No campaigns yet')} text={t('Create a campaign, then add its route and assign drivers.')} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('Advertiser')}</th>
                <th>{t('Campaign')}</th>
                <th>{t('Dates')}</th>
                <th>{t('Stops')}</th>
                <th>{t('Drivers today')}</th>
                <th>{t('Visits')}</th>
                <th>{t('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="click" onClick={() => nav(`/admin/campaigns/${c.id}`)}>
                  <td><b>{c.advertiser}</b></td>
                  <td>
                    <div>{c.name}</div>
                    <div className="small muted">v{c.route_version} &bull; {c.photo_interval_min}m / {c.min_stay_min}m stay</div>
                  </td>
                  <td className="nowrap small">{fmtDate(c.start_date)} – {fmtDate(c.end_date)}</td>
                  <td>{c.stop_count}</td>
                  <td>{c.drivers_today}</td>
                  <td>{c.visit_count} <span className="muted small">({c.approved_count} ok)</span></td>
                  <td><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {adding && <NewCampaign onClose={() => setAdding(false)} onSaved={(id) => nav(`/admin/campaigns/${id}`)} />}
    </>
  );
}
