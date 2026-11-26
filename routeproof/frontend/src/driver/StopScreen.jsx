import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Clock, LogOut as Leave, Navigation, AlertTriangle, CheckCircle2, Maximize2 } from 'lucide-react';
import { useLang } from '../i18n.jsx';
import { PhotoLightbox, StatusBadge, useToast } from '../ui.jsx';
import CaptureSheet from './CaptureSheet.jsx';
import { useToday, useTick } from './DriverLayout.jsx';
import { lastPhotoTs } from './DriverHome.jsx';

const PHOTO_LABEL = { arrival: 'Arrival', interval: 'During visit', departure: 'Departure' };

export default function StopScreen() {
  const { campaignId, stopId } = useParams();
  const { t, fmtTime } = useLang();
  const { campaigns, vehicle, queued, reload, refreshQueue, nowMs } = useToday();
  const toast = useToast();
  const nav = useNavigate();
  const [capture, setCapture] = useState(null);
  const [zoomIdx, setZoomIdx] = useState(null);
  useTick(1000);

  const campaign = campaigns.find((c) => c.id === +campaignId);
  const stop = campaign?.stops.find((s) => s.id === +stopId);
  if (!stop) {
    return (
      <div className="dbody">
        <p>{t('Stop not found')}</p>
        <Link to="/driver">{t('Back to route')}</Link>
      </div>
    );
  }
  const v = stop.visit;
  const stopQueued = (queued || []).filter((q) => +q.stop_id === stop.id);

  const done = async (r) => {
    setCapture(null);
    await refreshQueue();
    if (r.offline) {
      toast(t('Saved offline - will upload automatically when online'));
      return;
    }
    await reload();
    if (r.within_radius === false) toast(t('Saved, but you are {m} m from the stop. Admin will review it.', { m: r.distance_m }), 'err');
    else toast(t('Photo saved'));
    if (r.type === 'departure') nav('/driver');
  };

  const lastTs = lastPhotoTs(v);
  const left = v?.status === 'arrived' ? campaign.photo_interval_min * 60 - (nowMs() / 1000 - lastTs) : 0;
  const isDue = left <= 0;

  const reqStay = stop.min_stay_min ?? campaign.min_stay_min ?? 0;
  const stayedMin = v?.arrived_ts ? Math.floor((nowMs() / 1000 - v.arrived_ts) / 60) : 0;
  const stayLeft = Math.max(0, reqStay - stayedMin);

  const mmss = (s) => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

  return (
    <div className="dbody">
      <div className="row">
        <Link to="/driver" className="icon-btn" aria-label={t('Back to route')}><ArrowLeft size={22} /></Link>
        <div style={{ minWidth: 0 }}>
          <div className="small muted">{campaign.name}</div>
          <h1 style={{ fontSize: 21 }}>{stop.seq}. {stop.name}</h1>
        </div>
      </div>

      <div className="card card-pad stack" style={{ gap: 10 }}>
        <div>{stop.address || '-'}</div>
        {stop.instructions && <div className="banner"><div>{stop.instructions}</div></div>}
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <span className="small muted">{t('Allowed distance')}: {stop.radius_m} m {reqStay > 0 ? `• ${t('Min stay {n} min', { n: reqStay })}` : ''}</span>
          {stop.latitude != null && (
            <a className="btn sm route" href={`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`} target="_blank" rel="noreferrer">
              <Navigation size={15} /> {t('Navigate')}
            </a>
          )}
        </div>
      </div>

      {!v && (
        <button className="btn primary lg" onClick={() => setCapture({ type: 'arrival', redo: false })}>
          <Camera size={21} /> {t("I've arrived - take photo")}
        </button>
      )}

      {v?.status === 'rejected' && (
        <div className="stack">
          <div className="banner red">
            <AlertTriangle size={18} style={{ flex: 'none', marginTop: 2 }} />
            <div>
              <b>{t('Rejected')}</b>{v.review_reason ? `: ${v.review_reason}` : ''}
            </div>
          </div>
          <button className="btn primary lg" onClick={() => setCapture({ type: 'arrival', redo: true })}>
            <Camera size={21} /> {t('Redo stop - take arrival photo')}
          </button>
        </div>
      )}

      {v?.status === 'arrived' && (
        <>
          <div className={`banner ${isDue ? '' : 'green'}`} style={{ alignItems: 'center' }}>
            <Clock size={22} style={{ flex: 'none' }} />
            <div>
              {isDue ? (
                <>
                  <b>{t('Next photo is due now')}</b>
                  <div className="small">{t('Take a photo to show the vehicle is still here.')}</div>
                </>
              ) : (
                <>
                  <div className="small">{t('Next photo in')}</div>
                  <div className="timer">{mmss(left)}</div>
                </>
              )}
            </div>
          </div>

          {reqStay > 0 && (
            <div className={`banner ${stayLeft === 0 ? 'green' : 'info'}`} style={{ alignItems: 'center', padding: '9px 12px' }}>
              <CheckCircle2 size={17} style={{ flex: 'none' }} />
              <span className="small">
                {stayLeft === 0 ? t('Minimum stay met') : t('Stay {m} more min before departure', { m: stayLeft })}
              </span>
            </div>
          )}

          <button className={`btn lg ${isDue ? 'primary' : ''}`} onClick={() => setCapture({ type: 'interval', redo: false })}>
            <Camera size={21} /> {t('Add photo')}
          </button>
          <button className="btn lg" onClick={() => setCapture({ type: 'departure', redo: false })}>
            <Leave size={20} /> {t('Leaving - take departure photo')}
          </button>
        </>
      )}

      {v && v.status !== 'arrived' && v.status !== 'rejected' && (
        <div className="card card-pad row spread">
          <div>
            <b>{t('Visit finished')}</b>
            <div className="small muted">{fmtTime(v.arrived_at)} – {fmtTime(v.departed_at)}</div>
          </div>
          <StatusBadge status={v.status} />
        </div>
      )}

      {stopQueued.length > 0 && (
        <div className="banner info">
          <div><b>{t('{n} offline photos waiting to upload', { n: stopQueued.length })}</b></div>
        </div>
      )}

      {v?.photos?.length > 0 && (
        <div>
          <h3 style={{ marginBottom: 10 }}>{t('Your photos')}</h3>
          <div className="shots">
            {v.photos.map((p, i) => (
              <div key={i} className="shot">
                <div className="shot-img-wrap" onClick={() => setZoomIdx(i)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setZoomIdx(i)}>
                  <img src={p.file_path} alt="" loading="lazy" />
                  <span className="shot-expand"><Maximize2 size={11} /></span>
                </div>
                <div className="cap">
                  <b>{t(PHOTO_LABEL[p.type])}</b>
                  <span>{fmtTime(p.taken_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {capture && (
        <CaptureSheet
          stop={stop}
          campaign={campaign}
          vehicle={vehicle}
          type={capture.type}
          redo={capture.redo}
          onClose={() => setCapture(null)}
          onDone={done}
        />
      )}
      {zoomIdx !== null && v?.photos && (
        <PhotoLightbox photos={v.photos} index={zoomIdx} onIndex={setZoomIdx} onClose={() => setZoomIdx(null)} />
      )}
    </div>
  );
}
