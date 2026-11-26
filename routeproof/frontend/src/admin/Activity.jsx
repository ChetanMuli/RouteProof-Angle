import { useState } from 'react';
import { api, qs } from '../api.js';
import { useLang } from '../i18n.jsx';
import { Empty, Field, Spinner, useLoad } from '../ui.jsx';

export default function Activity() {
  const { t, fmtDate, fmtTime } = useLang();
  const [f, setF] = useState({ entity: '', q: '' });
  const { data, loading, error } = useLoad(() => api('/audit' + qs(f)), [JSON.stringify(f)]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Activity log')}</h1>
          <p>{t('Who changed what, and when. Nothing here can be edited.')}</p>
        </div>
      </div>

      <div className="card card-pad row wrap" style={{ marginBottom: 16 }}>
        <Field label={t('Search')}>
          <input className="input" placeholder="Action or details..." value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        </Field>
        <Field label="Entity">
          <select className="input" value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })}>
            <option value="">{t('All')}</option>
            <option value="campaign">campaign</option>
            <option value="stop">stop</option>
            <option value="visit">visit</option>
            <option value="user">user</option>
            <option value="vehicle">vehicle</option>
          </select>
        </Field>
      </div>

      <div className="card table-wrap">
        {loading && !data ? <Spinner /> : error ? <p className="error-text" style={{ padding: 16 }}>{error}</p> : !data.length ? <Empty title={t('No activity yet')} /> : (
          <table>
            <thead>
              <tr><th>{t('When')}</th><th>{t('Who')}</th><th>{t('Action')}</th><th>Old value</th><th>New value / {t('Details')}</th></tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id}>
                  <td className="nowrap small">{fmtDate(a.created_at)} {fmtTime(a.created_at)}</td>
                  <td>{a.user_name || '-'}</td>
                  <td>
                    <b>{a.action.replace(/_/g, ' ')}</b>{' '}
                    <span className="muted small">{a.entity}{a.entity_id ? ` #${a.entity_id}` : ''}</span>
                  </td>
                  <td className="small mono muted" style={{ maxWidth: 260, overflowWrap: 'anywhere' }}>{a.old_value || '-'}</td>
                  <td className="small mono" style={{ maxWidth: 320, overflowWrap: 'anywhere' }}>{a.new_value || a.details || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
