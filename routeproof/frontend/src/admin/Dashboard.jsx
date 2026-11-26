import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RefreshCw, AlertTriangle, Maximize2 } from 'lucide-react';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { localISO } from '../utils.js';
import { Empty, PhotoLightbox, Spinner, StatusBadge, useLoad } from '../ui.jsx';

const LABEL = { arrival: 'Arrival', interval: 'During visit', departure: 'Departure' };

export default function Dashboard() {
  const { t, fmtDate, fmtTime } = useLang();
  const { data: d, loading, error, reload } = useLoad(() => api('/dashboard'));
  const [zoomIdx, setZoomIdx] = useState(null);
  const nav = useNavigate();
  if (loading && !d) return <Spinner />;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Today')}</h1>
          <p>{fmtDate(localISO())}</p>
        </div>
        <button className="btn sm" onClick={reload}><RefreshCw size={14} /> {t('Refresh')}</button>
      </div>

      <div className="stats">
        <div className="card stat n">
          <div className="label">{t('Drivers on duty')}</div>
          <div className="num">{d.drivers_on_duty}</div>
          <div className="small muted">{t('{n} vehicles selected', { n: d.vehicles_in_use })}</div>
        </div>
        <div className="card stat">
          <div className="label">{t('Visits done')}</div>
          <div className="num">{d.visits.completed}<span className="muted" style={{ fontSize: 17 }}> / {d.planned_visits}</span></div>
          <div className="small muted">{t('{n} in progress', { n: d.visits.arrived })}</div>
        </div>
        <div className="card stat y">
          <div className="label">{t('Missed / pending')}</div>
          <div className="num">{d.missed_visits}</div>
          <div className="small muted">{t('Not started yet today')}</div>
        </div>
        <div className="card stat b">
          <div className="label">{t('Awaiting review')}</div>
          <div className="num">{d.awaiting_review}</div>
          <Link to="/admin/visits?status=completed" className="small">{t('Review now')}</Link>
        </div>
        <div className="card stat r">
          <div className="label">{t('Flagged for review')}</div>
          <div className="num">{d.flagged_pending}</div>
          <Link to="/admin/visits?flagged=1" className="small">{t('Outside radius or short stay')}</Link>
        </div>
      </div>

      {d.active_campaigns?.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 22 }}>
          <div className="row spread" style={{ marginBottom: 12 }}>
            <h2>{t("Today's route coverage")}</h2>
            <Link to="/admin/campaigns" className="small">{t('Campaigns')}</Link>
          </div>
          <div className="stack" style={{ gap: 12 }}>
            {d.active_campaigns.map((c) => {
              const pct = c.planned ? Math.round((c.done / c.planned) * 100) : 0;
              return (
                <Link key={c.id} to={`/admin/campaigns/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="row spread" style={{ marginBottom: 4 }}>
                    <span><b>{c.name}</b> <span className="muted small">&bull; {c.advertiser}</span></span>
                    <span className="small mono"><b>{c.done}/{c.planned}</b> ({pct}%)</span>
                  </div>
                  <div className="progress"><i style={{ width: `${pct}%` }} /></div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="page-head" style={{ marginBottom: 12 }}>
        <h2>{t('Latest photos')}</h2>
        <Link to="/admin/visits" className="small">{t('Visits')}</Link>
      </div>
      {!d.recent.length ? (
        <div className="card"><Empty title={t('No photos yet')} text={t('Photos appear here as soon as drivers upload them.')} /></div>
      ) : (
        <div className="photo-grid">
          {d.recent.map((p, idx) => (
            <div key={p.id} className="photo-card">
              <div className="shot-img-wrap" onClick={() => setZoomIdx(idx)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setZoomIdx(idx)}>
                <img src={p.file_path} alt="" loading="lazy" />
                <span className="shot-expand"><Maximize2 size={12} /> Expand</span>
              </div>
              <div className="cap" onClick={() => nav(`/admin/visits?open=${p.visit_id}`)} style={{ cursor: 'pointer' }}>
                <div className="row spread" style={{ marginBottom: 4 }}>
                  <b>{p.stop_name}</b>
                  {p.is_flagged ? <AlertTriangle size={14} color="#DC2626" /> : null}
                </div>
                <div className="muted small">{p.driver_name} &bull; {p.vehicle_number}</div>
                <div className="row spread" style={{ marginTop: 6 }}>
                  <span className="muted small">{t(LABEL[p.type])}, {fmtTime(p.taken_at)}</span>
                  <StatusBadge status={p.visit_status} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {zoomIdx !== null && d.recent && (
        <PhotoLightbox photos={d.recent} index={zoomIdx} onIndex={setZoomIdx} onClose={() => setZoomIdx(null)} />
      )}
    </>
  );
}
