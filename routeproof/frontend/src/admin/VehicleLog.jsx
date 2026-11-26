import { useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { api, downloadFile, qs } from '../api.js';
import { useLang } from '../i18n.jsx';
import { Empty, Field, Spinner, useLoad, useToast } from '../ui.jsx';
import { addDays, localISO } from '../utils.js';

export default function VehicleLog() {
  const { t, lang, fmtDate, fmtTime } = useLang();
  const toast = useToast();
  const [f, setF] = useState({ date_from: addDays(localISO(), -7), date_to: localISO() });
  const { data, loading, error } = useLoad(() => api('/reports/vehicle-log' + qs({ ...f, format: 'json' })), [JSON.stringify(f)]);
  const exportAs = async (format) => {
    try { await downloadFile('/reports/vehicle-log' + qs({ ...f, format, lang }), `driver-vehicle-log.${format}`); }
    catch (e) { toast(e.message, 'err'); }
  };
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Driver-vehicle log')}</h1>
          <p>{t('A permanent record of which driver had which vehicle, and for which campaign.')}</p>
        </div>
        <div className="row">
          <button className="btn sm" onClick={() => exportAs('xlsx')}><FileSpreadsheet size={15} /> Excel</button>
          <button className="btn sm" onClick={() => exportAs('pdf')}><FileText size={15} /> PDF</button>
        </div>
      </div>
      <div className="card card-pad row wrap" style={{ marginBottom: 16 }}>
        <Field label={t('From')}><input className="input" type="date" value={f.date_from} onChange={(e) => setF({ ...f, date_from: e.target.value })} /></Field>
        <Field label={t('To')}><input className="input" type="date" value={f.date_to} onChange={(e) => setF({ ...f, date_to: e.target.value })} /></Field>
      </div>
      <div className="card table-wrap">
        {loading && !data ? <Spinner /> : error ? <p className="error-text" style={{ padding: 16 }}>{error}</p> : !data.length ? <Empty title={t('No records in this period')} /> : (
          <table>
            <thead>
              <tr><th>{t('Date')}</th><th>{t('Driver')}</th><th>{t('Vehicle')}</th><th>{t('Advertiser')}</th><th>{t('Campaign')}</th><th>{t('Selected at')}</th></tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td className="nowrap small">{fmtDate(r.work_date)}</td>
                  <td><b>{r.driver_name}</b></td>
                  <td className="mono">{r.vehicle_number}</td>
                  <td>{r.advertiser || '-'}</td>
                  <td>{r.campaign_name || '-'}</td>
                  <td className="nowrap">{fmtTime(r.selected_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
