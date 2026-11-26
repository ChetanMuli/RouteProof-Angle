import { Link } from 'react-router-dom';
import { Bell, Check, ChevronRight, RefreshCw, Truck } from 'lucide-react';
import { useLang } from '../i18n.jsx';
import { Empty } from '../ui.jsx';
import { useToday, useTick } from './DriverLayout.jsx';

export const nodeState = (v) => (!v ? '' : v.status === 'arrived' ? 'arrived' : v.status === 'rejected' ? 'rejected' : 'done');
export const lastPhotoTs = (v) => (v?.photos?.length ? Math.max(...v.photos.map((p) => p.ts)) : 0);

export default function DriverHome() {
  const { t, fmtDate } = useLang();
  const { campaigns, vehicle, date, user, reload, changeVehicle, nowMs } = useToday();
  useTick(15000);

  const due = [];
  campaigns.forEach((c) => c.stops.forEach((s) => {
    if (s.visit?.status === 'arrived' && nowMs() / 1000 - lastPhotoTs(s.visit) >= c.photo_interval_min * 60) {
      due.push({ c, s });
    }
  }));

  return (
    <div className="dbody">
      <div className="row spread">
        <div>
          <h1>{t('Hello')}, {user.name.split(' ')[0]}</h1>
          <p className="muted" style={{ margin: '2px 0 0' }}>{fmtDate(date)}</p>
        </div>
        <button className="icon-btn" onClick={reload} aria-label={t('Refresh')}><RefreshCw size={18} /></button>
      </div>

      {vehicle && (
        <div className="vehicle-chip">
          <Truck size={22} />
          <div style={{ flex: 1 }}>
            <div className="small" style={{ color: '#94A3B8' }}>{t("Today's vehicle")}</div>
            <span className="plate">{vehicle.number}</span>
          </div>
          <button className="btn sm" style={{ background: 'var(--navy-2)', color: '#fff', borderColor: 'var(--navy-3)' }} onClick={changeVehicle}>
            {t('Change')}
          </button>
        </div>
      )}

      {due.map(({ c, s }) => (
        <Link key={s.id} to={`/driver/stop/${c.id}/${s.id}`} className="banner" style={{ textDecoration: 'none' }}>
          <Bell size={19} style={{ flex: 'none', marginTop: 2 }} />
          <div>
            <b>{t('Photo due at {stop}', { stop: s.name })}</b>
            <div className="small">{t('Tap to add the next photo')}</div>
          </div>
        </Link>
      ))}

      {!campaigns.length && (
        <div className="card">
          <Empty
            title={t('No campaign assigned today')}
            text={t('Your admin has not assigned you a campaign for today. Pull to refresh later or contact your admin.')}
          />
        </div>
      )}

      {campaigns.map((c) => {
        const done = c.stops.filter((s) => s.visit && (s.visit.status === 'completed' || s.visit.status === 'approved')).length;
        return (
          <section key={c.id} className="camp-card">
            <div className="camp-head">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="small muted">{c.advertiser}</div>
                <h2>{c.name}</h2>
                <div className="progress" aria-hidden="true">
                  <i style={{ width: `${c.stops.length ? (done / c.stops.length) * 100 : 0}%` }} />
                </div>
              </div>
              <span className="badge ok nowrap">{done}/{c.stops.length} {t('done')}</span>
            </div>
            {c.notes && <div className="small" style={{ padding: '8px 16px', background: '#FFFBEB', color: '#78350F', borderBottom: '1px solid var(--line)' }}>{c.notes}</div>}
            <ol className="route">
              {c.stops.map((s) => (
                <li key={s.id}>
                  <Link className="stop-link" to={`/driver/stop/${c.id}/${s.id}`}>
                    <span className={`node ${nodeState(s.visit)}`}>
                      {s.visit && (s.visit.status === 'completed' || s.visit.status === 'approved') ? <Check size={16} /> : s.seq}
                    </span>
                    <span className="t">
                      <b>{s.name}</b>
                      <span className="a">{s.address}</span>
                      {s.visit?.status === 'rejected' && <span className="small" style={{ color: 'var(--danger)', fontWeight: 600 }}>{t('Rejected')} — {t('Redo')}</span>}
                    </span>
                    <ChevronRight size={18} className="muted" />
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
