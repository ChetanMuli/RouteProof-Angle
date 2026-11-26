import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, FileText, AlertTriangle, WifiOff, Clock, Maximize2 } from 'lucide-react';
import { api, downloadFile, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLang } from '../i18n.jsx';
import { VisitMap } from '../MapViews.jsx';
import { Empty, Field, Modal, PhotoLightbox, Spinner, StatusBadge, useLoad, useToast } from '../ui.jsx';

const LABEL = { arrival: 'Arrival', interval: 'During visit', departure: 'Departure' };

function VisitDetail({ id, onClose, onChanged }) {
  const { t, fmtDate, fmtTime } = useLang();
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useLoad(() => api(`/visits/${id}`), [id]);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(null);

  const review = async (status) => {
    try {
      await api(`/visits/${id}/review`, { method: 'PATCH', body: { status, reason } });
      toast(status === 'approved' ? t('Approved') : t('Rejected'));
      setRejecting(false);
      reload();
      onChanged();
    } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <Modal size="wide" title={data ? `${data.visit.stop_name} — ${data.visit.vehicle_number}` : t('Visit')} onClose={onClose}>
      {loading || !data ? <Spinner /> : (() => {
        const { visit: v, photos, stop } = data;
        const first = photos[0];
        return (
          <div className="visit-layout">
            <div className="stack">
              <div className="photo-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))' }}>
                {photos.map((p, idx) => (
                  <div key={p.id} className="shot">
                    <div className="shot-img-wrap" onClick={() => setZoomIdx(idx)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setZoomIdx(idx)}>
                      <img src={p.file_path} alt="" />
                      <span className="shot-expand"><Maximize2 size={12} /> Expand</span>
                    </div>
                    <div className="cap">
                      <div>
                        <b>{t(LABEL[p.type])}</b> <span className="muted">{fmtTime(p.taken_at)}</span>
                        {p.captured_offline ? <span className="badge info" style={{ marginLeft: 6 }}><WifiOff size={11} /> Offline</span> : null}
                      </div>
                      <div className="row wrap" style={{ gap: 4 }}>
                        {p.within_radius === 0 && <span className="badge bad"><AlertTriangle size={12} /> {t('{m} m from stop', { m: p.distance_m })}</span>}
                        {p.within_radius === 1 && <span className="badge ok">{t('At the stop')}</span>}
                        {p.accuracy_m != null && <span className="badge">±{Math.round(p.accuracy_m)} m</span>}
                      </div>
                      {p.flag_notes && <div className="small" style={{ color: 'var(--danger)', width: '100%' }}>{p.flag_notes}</div>}
                    </div>
                  </div>
                ))}
              </div>
              {!photos.length && <Empty title={t('No photos')} />}
            </div>

            <div className="stack">
              <div className="row spread">
                <div className="row">
                  <StatusBadge status={v.status} />
                  {v.attempt > 1 && <span className="badge yellow">Attempt #{v.attempt}</span>}
                </div>
                <span className="muted small">{fmtDate(v.work_date)}</span>
              </div>

              <dl className="kv" style={{ margin: 0 }}>
                <dt>{t('Advertiser')}</dt><dd>{v.advertiser}</dd>
                <dt>{t('Campaign')}</dt><dd>{v.campaign_name}</dd>
                <dt>{t('Driver')}</dt><dd>{v.driver_name}</dd>
                <dt>{t('Vehicle')}</dt><dd className="mono">{v.vehicle_number}</dd>
                <dt>{t('Arrived')}</dt><dd>{fmtTime(v.arrived_at)}</dd>
                <dt>{t('Left')}</dt><dd>{v.departed_at ? fmtTime(v.departed_at) : '-'}</dd>
                <dt>{t('Time at stop')}</dt>
                <dd>
                  {v.duration_min != null ? `${v.duration_min} min` : '-'}{' '}
                  {v.min_stay_met === 0 && <span className="badge warn"><Clock size={11} /> Short stay</span>}
                </dd>
                {first && (
                  <>
                    <dt>{t('GPS')}</dt><dd className="mono">{(+first.latitude).toFixed(5)}, {(+first.longitude).toFixed(5)}</dd>
                    <dt>{t('Address')}</dt><dd>{first.address || stop?.address || '-'}</dd>
                  </>
                )}
              </dl>

              {v.flag_reason && <div className="banner red"><AlertTriangle size={16} style={{ flex: 'none', marginTop: 2 }} /> <div><b>Flagged:</b> {v.flag_reason}</div></div>}
              {v.review_reason && <div className="banner"><b>{t('Reason')}:</b> {v.review_reason}</div>}

              {photos.length > 0 && <VisitMap stop={stop} photos={photos} height={220} />}

              {can('review') && v.status !== 'arrived' && (
                rejecting ? (
                  <div className="stack" style={{ gap: 8 }}>
                    <Field label={t('Reason for rejecting')}><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
                    <div className="row">
                      <button className="btn" onClick={() => setRejecting(false)}>{t('Cancel')}</button>
                      <button className="btn danger" onClick={() => review('rejected')}>{t('Reject visit')}</button>
                    </div>
                  </div>
                ) : (
                  <div className="row">
                    <button className="btn route" style={{ flex: 1 }} disabled={v.status === 'approved'} onClick={() => review('approved')}>{t('Approve')}</button>
                    <button className="btn danger" style={{ flex: 1 }} disabled={v.status === 'rejected'} onClick={() => setRejecting(true)}>{t('Reject')}</button>
                  </div>
                )
              )}
            </div>
          </div>
        );
      })()}
      {zoomIdx !== null && data?.photos && (
        <PhotoLightbox photos={data.photos} index={zoomIdx} onIndex={setZoomIdx} onClose={() => setZoomIdx(null)} />
      )}
    </Modal>
  );
}

export default function Visits() {
  const { t, lang, fmtDate, fmtTime } = useLang();
  const { can } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [f, setF] = useState({
    date_from: '',
    date_to: '',
    campaign_id: '',
    driver_id: '',
    vehicle_id: '',
    status: params.get('status') || '',
    flagged: params.get('flagged') || '',
  });
  const [summaryBy, setSummaryBy] = useState('driver');

  const { data, loading, error, reload } = useLoad(() => api('/visits' + qs(f)), [JSON.stringify(f)]);
  const { data: campaigns } = useLoad(() => api('/campaigns'));
  const { data: drivers } = useLoad(() => api('/users?role=driver'));
  const { data: vehicles } = useLoad(() => api('/vehicles?all=1'));

  const open = params.get('open');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const openModal = (id) => {
    const next = new URLSearchParams(params);
    next.set('open', id);
    setParams(next);
  };
  const closeModal = () => {
    const next = new URLSearchParams(params);
    next.delete('open');
    setParams(next);
  };

  const exportVisits = async (format) => {
    try { await downloadFile('/reports/visits' + qs({ ...f, format, lang }), `visit-report.${format}`); }
    catch (e) { toast(e.message, 'err'); }
  };
  const exportSummary = async (format) => {
    try { await downloadFile('/reports/summary' + qs({ ...f, group_by: summaryBy, format, lang }), `summary-by-${summaryBy}.${format}`); }
    catch (e) { toast(e.message, 'err'); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Visits')}</h1>
          <p>{t('Every stop a driver reached, with arrival and departure photos.')}</p>
        </div>
        {can('reports') && (
          <div className="row wrap">
            <button className="btn sm" onClick={() => exportVisits('xlsx')}><FileSpreadsheet size={15} /> Visits Excel</button>
            <button className="btn sm" onClick={() => exportVisits('pdf')}><FileText size={15} /> Visits PDF</button>
            <select className="input" style={{ width: 'auto', minHeight: 31, padding: '4px 10px' }} value={summaryBy} onChange={(e) => setSummaryBy(e.target.value)}>
              <option value="driver">{t('By driver')}</option>
              <option value="vehicle">{t('By vehicle')}</option>
              <option value="campaign">{t('By campaign')}</option>
              <option value="date">{t('By date')}</option>
            </select>
            <button className="btn sm" onClick={() => exportSummary('xlsx')}><FileSpreadsheet size={15} /> {t('Summary report')}</button>
            <button className="btn sm" onClick={() => exportSummary('pdf')}><FileText size={15} /> PDF</button>
          </div>
        )}
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))' }}>
          <Field label={t('From')}><input className="input" type="date" value={f.date_from} onChange={set('date_from')} /></Field>
          <Field label={t('To')}><input className="input" type="date" value={f.date_to} onChange={set('date_to')} /></Field>
          <Field label={t('Campaign')}>
            <select className="input" value={f.campaign_id} onChange={set('campaign_id')}>
              <option value="">{t('All')}</option>
              {(campaigns || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label={t('Driver')}>
            <select className="input" value={f.driver_id} onChange={set('driver_id')}>
              <option value="">{t('All')}</option>
              {(drivers || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label={t('Vehicle')}>
            <select className="input" value={f.vehicle_id} onChange={set('vehicle_id')}>
              <option value="">{t('All')}</option>
              {(vehicles || []).map((v) => <option key={v.id} value={v.id}>{v.number}</option>)}
            </select>
          </Field>
          <Field label={t('Status')}>
            <select className="input" value={f.status} onChange={set('status')}>
              <option value="">{t('All')}</option>
              <option value="arrived">{t('In progress')}</option>
              <option value="completed">{t('Awaiting review')}</option>
              <option value="approved">{t('Approved')}</option>
              <option value="rejected">{t('Rejected')}</option>
            </select>
          </Field>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <label className="check" style={{ padding: '6px 12px' }}>
            <input type="checkbox" checked={f.flagged === '1'} onChange={(e) => setF({ ...f, flagged: e.target.checked ? '1' : '' })} />
            <span className="small">{t('Flagged only')}</span>
          </label>
        </div>
      </div>

      <div className="card table-wrap">
        {loading && !data ? <Spinner /> : error ? <p className="error-text" style={{ padding: 16 }}>{error}</p> : !data.length ? (
          <Empty title={t('No visits found')} text={t('Try another date range or filter.')} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('Date')}</th><th>{t('Campaign')}</th><th>{t('Stop')}</th><th>{t('Driver')}</th>
                <th>{t('Vehicle')}</th><th>{t('Arrived')}</th><th>{t('Left')}</th><th>{t('Photos')}</th><th>{t('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((v) => (
                <tr key={v.id} className="click" onClick={() => openModal(v.id)}>
                  <td className="nowrap small">{fmtDate(v.work_date)}</td>
                  <td>{v.campaign_name}</td>
                  <td><b>{v.stop_name}</b></td>
                  <td>{v.driver_name}</td>
                  <td className="mono">{v.vehicle_number}</td>
                  <td className="nowrap">{fmtTime(v.arrived_at)}</td>
                  <td className="nowrap">{v.departed_at ? fmtTime(v.departed_at) : '-'}</td>
                  <td className="nowrap">
                    {v.photo_count}{' '}
                    {(v.flagged_count > 0 || v.flag_reason) && (
                      <span className="badge bad" title={v.flag_reason || t('Photo taken away from the stop')}>
                        <AlertTriangle size={12} />
                      </span>
                    )}
                  </td>
                  <td><StatusBadge status={v.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {open && <VisitDetail id={open} onClose={closeModal} onChanged={reload} />}
    </>
  );
}
