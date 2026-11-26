import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { History, LogOut, MapPinned, RefreshCw, Truck, WifiOff } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLang } from '../i18n.jsx';
import { listQueuedPhotos, removeQueuedPhoto } from '../offlineQueue.js';
import { LangSwitch, Logo, Modal, Spinner, useLoad, useToast } from '../ui.jsx';

const TodayCtx = createContext(null);
export const useToday = () => useContext(TodayCtx);
export const useTick = (ms = 1000) => {
  const [, set] = useState(0);
  useEffect(() => {
    const i = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(i);
  }, [ms]);
};

/* First screen each day: pick from vehicle list OR type a vehicle number */
function VehiclePopup({ current, onSaved, onCancel }) {
  const { t } = useLang();
  const toast = useToast();
  const { data: vehicles, loading } = useLoad(() => api('/vehicles'));
  const [pick, setPick] = useState(current?.id || null);
  const [customNum, setCustomNum] = useState('');
  const [customType, setCustomType] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

  const list = (vehicles || []).filter((v) => v.number.includes(filter.toUpperCase().replace(/\s+/g, '')));
  const cleanCustom = customNum.toUpperCase().replace(/\s+/g, '');
  const canSave = (pick && !cleanCustom) || cleanCustom.length >= 4;

  const save = async () => {
    setBusy(true);
    try {
      const body = cleanCustom.length >= 4 ? { vehicle_number: cleanCustom, vehicle_type: customType } : { vehicle_id: pick };
      await api('/driver/vehicle', { method: 'POST', body });
      onSaved();
    } catch (e) {
      toast(e.message, 'err');
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t('Which vehicle do you have today?')}
      onClose={onCancel}
      footer={
        <button className="btn primary lg" disabled={!canSave || busy} onClick={save}>
          {t('Confirm vehicle')}
        </button>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>{t('Your photos and reports will be linked to this vehicle number.')}</p>
      <input
        className="input"
        placeholder={t('Search vehicle number')}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      {loading ? <Spinner /> : (
        <div className="stack" style={{ gap: 8, maxHeight: 220, overflowY: 'auto' }}>
          {list.map((v) => (
            <label
              key={v.id}
              className="check"
              style={pick === v.id && !cleanCustom ? { borderColor: 'var(--route)', background: 'var(--route-soft)' } : null}
            >
              <input
                type="radio"
                name="vehicle"
                checked={pick === v.id && !cleanCustom}
                onChange={() => { setPick(v.id); setCustomNum(''); }}
              />
              <b className="mono" style={{ letterSpacing: '.04em' }}>{v.number}</b>
              <span className="muted small">{v.type}</span>
            </label>
          ))}
          {!list.length && <p className="muted small">{t('No vehicle found. Ask your admin to add it.')}</p>}
        </div>
      )}

      <div className="stack" style={{ gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
        <span className="small" style={{ fontWeight: 600 }}>{t('Or enter vehicle number')}</span>
        <div className="form-grid">
          <input
            className="input mono"
            placeholder="MH12ZZ9999"
            value={customNum}
            onChange={(e) => { setCustomNum(e.target.value); if (e.target.value) setPick(null); }}
          />
          <input
            className="input"
            placeholder={t('Type')}
            value={customType}
            onChange={(e) => setCustomType(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}

export default function DriverLayout() {
  const { user, logout } = useAuth();
  const { t } = useLang();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api('/driver/today'));
  const [changing, setChanging] = useState(false);
  const [queued, setQueued] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  const refreshQueue = useCallback(async () => {
    try { setQueued(await listQueuedPhotos()); } catch { setQueued([]); }
  }, []);

  const syncOffline = useCallback(async () => {
    if (syncing || !navigator.onLine) return;
    const items = await listQueuedPhotos().catch(() => []);
    if (!items.length) { setQueued([]); return; }
    setSyncing(true);
    let uploaded = 0;
    for (const item of items) {
      try {
        const form = new FormData();
        form.append('stop_id', item.stop_id);
        form.append('type', item.type);
        form.append('latitude', item.latitude);
        form.append('longitude', item.longitude);
        form.append('accuracy', item.accuracy ?? '');
        form.append('address', item.address || '');
        form.append('captured_offline', '1');
        form.append('taken_at', item.taken_at);
        if (item.redo) form.append('redo', '1');
        form.append('image', item.blob, 'photo.jpg');
        await api('/driver/photo', { method: 'POST', form });
        await removeQueuedPhoto(item.id);
        uploaded += 1;
      } catch (e) {
        // Stop syncing on transient network failure; remove permanently invalid items (4xx)
        if (!/Cannot reach/i.test(e.message)) {
          await removeQueuedPhoto(item.id);
        } else {
          break;
        }
      }
    }
    setSyncing(false);
    await refreshQueue();
    if (uploaded > 0) {
      toast(`${uploaded} offline photo(s) uploaded`);
      reload();
    }
  }, [syncing, refreshQueue, reload, toast]);

  useEffect(() => {
    refreshQueue();
    const onOnline = () => { setOnline(true); syncOffline(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refreshQueue, syncOffline]);

  const skew = data ? data.now_ts * 1000 - Date.now() : 0;

  return (
    <div className="dshell">
      <header className="dtop">
        <div className="brand"><Logo size={25} /> RouteProof</div>
        <div className="row">
          {!online && <span className="badge bad"><WifiOff size={12} /> Offline</span>}
          <LangSwitch />
          <button className="icon-btn" style={{ color: '#fff' }} onClick={logout} aria-label={t('Log out')}><LogOut size={18} /></button>
        </div>
      </header>

      {queued.length > 0 && (
        <div className="banner info" style={{ margin: '12px 16px 0', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="row">
            <WifiOff size={17} style={{ flex: 'none' }} />
            <span>{syncing ? t('Syncing offline photos...') : t('{n} offline photos waiting to upload', { n: queued.length })}</span>
          </div>
          {online && !syncing && (
            <button className="btn sm" onClick={syncOffline}><RefreshCw size={13} /> {t('Sync now')}</button>
          )}
        </div>
      )}

      {loading && !data && <Spinner />}
      {error && <div className="dbody"><p className="error-text">{error}</p></div>}
      {data && (
        <TodayCtx.Provider value={{ ...data, user, reload, queued, refreshQueue, changeVehicle: () => setChanging(true), nowMs: () => Date.now() + skew }}>
          <Outlet />
          {(!data.vehicle || changing) && (
            <VehiclePopup
              current={data.vehicle}
              onCancel={data.vehicle ? () => setChanging(false) : null}
              onSaved={() => { setChanging(false); reload(); }}
            />
          )}
        </TodayCtx.Provider>
      )}

      <nav className="dnav" aria-label="Driver navigation">
        <NavLink to="/driver" end><MapPinned size={19} /> {t("Today's route")}</NavLink>
        <NavLink to="/driver/history"><History size={19} /> {t('History')}</NavLink>
      </nav>
    </div>
  );
}
