import { Truck } from 'lucide-react';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { Empty, Spinner, StatusBadge, useLoad } from '../ui.jsx';

export default function DriverHistory() {
  const { t, fmtDate, fmtTime } = useLang();
  const { data, loading, error } = useLoad(() => api('/driver/history'));

  if (loading) return <Spinner />;
  if (error) return <div className="dbody"><p className="error-text">{error}</p></div>;

  return (
    <div className="dbody">
      <h1>{t('History')}</h1>

      <section className="stack" style={{ gap: 10 }}>
        <h2>{t('Past days & vehicles')}</h2>
        {!data.vehicle_logs.length ? (
          <div className="card"><Empty title={t('No records in this period')} /></div>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {data.vehicle_logs.map((l, idx) => (
              <div key={idx} className="card card-pad row spread" style={{ padding: '12px 14px' }}>
                <div className="row">
                  <Truck size={18} color="var(--navy)" />
                  <div>
                    <b className="mono">{l.vehicle_number}</b>
                    <div className="small muted">{l.campaign_name || '-'}</div>
                  </div>
                </div>
                <div className="right small">
                  <div><b>{fmtDate(l.work_date)}</b></div>
                  <div className="muted">{fmtTime(l.selected_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="stack" style={{ gap: 10 }}>
        <h2>{t('Recent visits')}</h2>
        {!data.visits.length ? (
          <div className="card"><Empty title={t('No past visits yet')} /></div>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {data.visits.map((v) => (
              <div key={v.id} className="card card-pad row" style={{ padding: '12px 14px', alignItems: 'flex-start' }}>
                {v.thumb && (
                  <img
                    src={v.thumb}
                    alt=""
                    style={{ width: 64, height: 52, objectFit: 'cover', borderRadius: 8, background: '#E2E8F0', flex: 'none' }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row spread">
                    <b>{v.stop_name}</b>
                    <StatusBadge status={v.status} />
                  </div>
                  <div className="small muted">{v.campaign_name} &bull; {v.vehicle_number}</div>
                  <div className="small muted" style={{ marginTop: 2 }}>
                    {fmtDate(v.work_date)} &bull; {fmtTime(v.arrived_at)}{v.departed_at ? ` – ${fmtTime(v.departed_at)}` : ''} ({v.photo_count} photos)
                  </div>
                  {v.review_reason && <div className="small" style={{ color: 'var(--danger)', marginTop: 4 }}>{v.review_reason}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
