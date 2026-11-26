import { useEffect, useRef, useState } from 'react';
import { X, MapPin, Camera, Sparkles, Crosshair } from 'lucide-react';
import { api } from '../api.js';
import { enqueuePhoto } from '../offlineQueue.js';
import { stampImage } from '../stamp.js';
import { useLang } from '../i18n.jsx';
import { haversineMeters, localDateTime } from '../utils.js';

const TITLES = { arrival: 'Arrival photo', interval: 'Photo during visit', departure: 'Departure photo' };

// Full-screen live camera only (no gallery): locks GPS, resolves address clearly, burns GPS proof onto JPEG, uploads or queues offline.
export default function CaptureSheet({ stop, campaign, vehicle, type, redo, onClose, onDone }) {
  const { t } = useLang();
  const videoRef = useRef(null), streamRef = useRef(null), gpsRef = useRef(null), addrRef = useRef(''), demoRef = useRef(false);
  const [gps, setGps] = useState(null);
  const [gpsErr, setGpsErr] = useState('');
  const [liveAddr, setLiveAddr] = useState('');
  const [addrBusy, setAddrBusy] = useState(false);
  const [camErr, setCamErr] = useState(false);
  const [shot, setShot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let stopped = false;
    if (!navigator.mediaDevices?.getUserMedia) { setCamErr(true); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((s) => {
        if (stopped) { s.getTracks().forEach((x) => x.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
      })
      .catch(() => setCamErr(true));
    return () => { stopped = true; streamRef.current?.getTracks().forEach((x) => x.stop()); };
  }, []);

  useEffect(() => () => { if (shot?.url) URL.revokeObjectURL(shot.url); }, [shot]);

  useEffect(() => {
    if (!navigator.geolocation) { setGpsErr('This device cannot share its location'); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (demoRef.current) return;
        const g = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        gpsRef.current = g;
        setGps(g);
        setGpsErr('');
      },
      (e) => setGpsErr(e.code === 1 ? 'Location is blocked. Allow location for this site, then try again.' : 'Could not get your location. Move to an open area and try again.'),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const fetchAddress = async (lat, lng) => {
    if (!navigator.onLine) return addrRef.current || stop.address || '';
    setAddrBusy(true);
    try {
      const r = await Promise.race([
        api(`/geo/reverse?lat=${lat}&lng=${lng}`),
        new Promise((res) => setTimeout(() => res(null), 2600)),
      ]);
      const found = r?.address || addrRef.current || stop.address || '';
      addrRef.current = found;
      setLiveAddr(found);
      return found;
    } catch {
      return addrRef.current || stop.address || '';
    } finally {
      setAddrBusy(false);
    }
  };

  const gKey = gps ? `${gps.lat.toFixed(4)},${gps.lng.toFixed(4)}` : '';
  useEffect(() => {
    if (!gps) return;
    fetchAddress(gps.lat, gps.lng);
  }, [gKey]); // eslint-disable-line

  const useDemoLocation = () => {
    demoRef.current = true;
    const g = { lat: +stop.latitude, lng: +stop.longitude, accuracy: 6 };
    gpsRef.current = g;
    const fallback = `${stop.name}${stop.address ? ', ' + stop.address : ''}`;
    addrRef.current = fallback;
    setLiveAddr(fallback);
    setGps(g);
    setGpsErr('');
    fetchAddress(g.lat, g.lng);
  };

  const distanceM = gps && stop.latitude != null && stop.longitude != null
    ? haversineMeters(gps.lat, gps.lng, +stop.latitude, +stop.longitude)
    : null;

  const snap = async (source) => {
    const g = gpsRef.current;
    if (!g) { setErr(t('Waiting for GPS. Please try again in a moment.')); return; }
    setErr('');
    setSnapping(true);
    try {
      // Ensure reverse geocoded address is resolved before stamping
      let address = addrRef.current;
      if (!address || (demoRef.current && address === `${stop.name}${stop.address ? ', ' + stop.address : ''}`)) {
        const fresh = await fetchAddress(g.lat, g.lng);
        if (fresh) address = fresh;
      }
      if (!address) address = stop.address || stop.name;

      const takenAt = new Date();
      const dist = stop.latitude != null && stop.longitude != null
        ? haversineMeters(g.lat, g.lng, +stop.latitude, +stop.longitude)
        : null;
      const blob = await stampImage(source, {
        lat: g.lat, lng: g.lng, accuracy: g.accuracy, address,
        distanceM: dist, radiusM: stop.radius_m,
        vehicle: vehicle.number, campaign: campaign.name, stop: stop.name, seq: stop.seq, type, takenAt,
      });
      setShot({ blob, url: URL.createObjectURL(blob), g: { ...g }, address, takenAtStr: localDateTime(takenAt) });
    } catch (e) {
      setErr(e.message);
    } finally {
      setSnapping(false);
    }
  };

  const fromVideo = () => (videoRef.current?.videoWidth ? snap(videoRef.current) : setErr(t('Camera is not ready yet')));

  const fromFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => { snap(img); URL.revokeObjectURL(img.src); };
    img.src = URL.createObjectURL(f);
    e.target.value = '';
  };

  // Synthetic camera frame for desktop testing without a webcam (only shown in demo mode)
  const fromDemoCam = () => {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 900;
    const ctx = c.getContext('2d');
    const sky = ctx.createLinearGradient(0, 0, 0, 520);
    sky.addColorStop(0, '#1E3A5F'); sky.addColorStop(1, '#475569');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 1200, 540);
    ctx.fillStyle = '#334155'; ctx.fillRect(0, 540, 1200, 360);
    ctx.strokeStyle = '#F59E0B'; ctx.lineWidth = 8; ctx.setLineDash([40, 30]);
    ctx.beginPath(); ctx.moveTo(0, 720); ctx.lineTo(1200, 720); ctx.stroke(); ctx.setLineDash([]);
    // Stylized ad-wrapped vehicle silhouette
    ctx.fillStyle = '#F8FAFC'; ctx.fillRect(190, 230, 820, 350);
    ctx.fillStyle = '#F59E0B'; ctx.fillRect(190, 230, 820, 78);
    ctx.fillStyle = '#0F172A'; ctx.fillRect(230, 580, 110, 55); ctx.fillRect(860, 580, 110, 55);
    ctx.fillStyle = '#0F172A'; ctx.font = 'bold 38px sans-serif';
    ctx.fillText(campaign.advertiser.slice(0, 28), 230, 282);
    ctx.fillStyle = '#0F172A'; ctx.font = 'bold 46px sans-serif';
    ctx.fillText(campaign.name.slice(0, 26), 230, 385);
    ctx.fillStyle = '#475569'; ctx.font = 'bold 30px monospace';
    ctx.fillText(`VEHICLE: ${vehicle.number}   |   STOP: ${stop.name}`, 230, 455);
    ctx.fillStyle = '#059669'; ctx.font = 'bold 24px sans-serif';
    ctx.fillText('LIVE PROOF-OF-DISPLAY CAPTURE', 230, 520);
    snap(c);
  };

  const upload = async () => {
    setBusy(true); setErr('');
    const saveOffline = async () => {
      await enqueuePhoto({
        stop_id: stop.id, type, latitude: shot.g.lat, longitude: shot.g.lng,
        accuracy: shot.g.accuracy || '', address: shot.address || '',
        taken_at: shot.takenAtStr, redo: !!redo, blob: shot.blob,
      });
      onDone({ offline: true, type });
    };

    if (!navigator.onLine) {
      await saveOffline();
      return;
    }

    const form = new FormData();
    form.append('stop_id', stop.id);
    form.append('type', type);
    form.append('latitude', shot.g.lat);
    form.append('longitude', shot.g.lng);
    form.append('accuracy', shot.g.accuracy || '');
    form.append('address', shot.address || '');
    form.append('taken_at', shot.takenAtStr);
    if (redo) form.append('redo', '1');
    form.append('image', shot.blob, 'photo.jpg');

    try {
      onDone(await api('/driver/photo', { method: 'POST', form }));
    } catch (e) {
      if (/Cannot reach/i.test(e.message)) {
        await saveOffline();
      } else {
        setErr(e.message);
        setBusy(false);
      }
    }
  };

  const isDemo = import.meta.env.VITE_DEMO_MODE === 'true';
  const showDemoLoc = isDemo && stop.latitude != null && !demoRef.current;

  return (
    <div className="sheet" role="dialog" aria-modal="true">
      <div className="sheet-top">
        <div>
          <b>{t(TITLES[type])}</b>
          <div className="small" style={{ color: '#94A3B8' }}>{stop.seq}. {stop.name} &bull; {vehicle.number}</div>
        </div>
        <button className="icon-btn" style={{ color: '#fff' }} onClick={onClose} aria-label={t('Close')}><X size={22} /></button>
      </div>

      <div className="sheet-stage">
        <video ref={videoRef} playsInline muted style={{ display: shot || camErr ? 'none' : 'block' }} />
        {shot && <img src={shot.url} alt="" />}
        {camErr && !shot && (
          <div style={{ padding: 24, textAlign: 'center', color: '#CBD5E1', maxWidth: 360 }}>
            <Camera size={40} style={{ marginBottom: 8 }} />
            <p>{t('Live camera is not available here. Use your device camera or demo mode below.')}</p>
          </div>
        )}
      </div>

      <div className="sheet-bar">
        <div className="stack" style={{ gap: 6, justifyItems: 'center' }}>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            <span className={`gps-pill ${gps ? (distanceM != null && distanceM > stop.radius_m ? 'bad' : 'ok') : gpsErr ? 'bad' : ''}`}>
              {gps ? <MapPin size={14} /> : gpsErr ? <MapPin size={14} /> : <i className="pulse" />}
              {gps
                ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}  •  ±${Math.round(gps.accuracy)} m${distanceM != null ? `  •  ${distanceM} m` : ''}`
                : gpsErr ? t(gpsErr) : t('Finding your location...')}
            </span>
            {showDemoLoc && (
              <button type="button" className="btn sm" onClick={useDemoLocation}>
                <Crosshair size={13} /> {t('Use stop location (demo)')}
              </button>
            )}
          </div>
          {gps && (
            <div className="small" style={{ color: '#CBD5E1', textAlign: 'center', maxWidth: 460 }}>
              {addrBusy ? 'Resolving street address...' : liveAddr || stop.address || ''}
            </div>
          )}
        </div>

        {err && <p className="error-text" style={{ color: '#FCA5A5', textAlign: 'center' }}>{err}</p>}

        {!shot && !camErr && (
          <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
            <button type="button" className="shutter" onClick={fromVideo} disabled={!gps || snapping} aria-label={t('Take photo')} />
            {isDemo && (
              <button type="button" className="btn sm" disabled={!gps || snapping} onClick={fromDemoCam}>
                <Sparkles size={14} /> {t('Use demo camera')}
              </button>
            )}
          </div>
        )}

        {!shot && camErr && (
          <div className="stack" style={{ gap: 8 }}>
            <label className="btn primary lg" style={{ opacity: gps && !snapping ? 1 : 0.5 }}>
              <Camera size={20} /> {snapping ? 'Stamping GPS...' : t('Take photo')}
              <input type="file" accept="image/*" capture="environment" hidden onChange={fromFile} disabled={!gps || snapping} />
            </label>
            {isDemo && (
              <button type="button" className="btn lg" disabled={!gps || snapping} onClick={fromDemoCam}>
                <Sparkles size={18} /> {snapping ? 'Stamping GPS...' : t('Use demo camera')}
              </button>
            )}
          </div>
        )}

        {shot && (
          <div className="row">
            <button type="button" className="btn lg" style={{ flex: 1 }} onClick={() => setShot(null)} disabled={busy}>{t('Retake')}</button>
            <button type="button" className="btn primary lg" style={{ flex: 2 }} onClick={upload} disabled={busy}>
              {busy ? t('Uploading...') : t('Upload photo')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
