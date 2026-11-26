import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useLang } from './i18n.jsx';

export function Modal({ title, onClose, children, footer, size = '' }) {
  const { t } = useLang();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && <button className="icon-btn" onClick={onClose} aria-label={t('Close')}><X size={20} /></button>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export const Field = ({ label, children, full }) => (
  <label className={`field ${full ? 'full' : ''}`}><span>{label}</span>{children}</label>
);

export function Spinner() {
  return <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>;
}

export const Empty = ({ title, text, children }) => (
  <div className="empty"><h3>{title}</h3>{text && <p style={{ margin: '0 0 12px' }}>{text}</p>}{children}</div>
);

const STATUS = {
  arrived: ['warn', 'In progress'],
  completed: ['info', 'Awaiting review'],
  approved: ['ok', 'Approved'],
  rejected: ['bad', 'Rejected'],
  active: ['ok', 'Active'],
  paused: ['warn', 'Paused'],
  closed: ['', 'Closed'],
};

export function StatusBadge({ status }) {
  const { t } = useLang();
  const [cls, label] = STATUS[status] || ['', status];
  return <span className={`badge ${cls}`}>{t(label)}</span>;
}

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, kind = '') => {
    const id = Math.random();
    setItems((a) => [...a, { id, text, kind }]);
    setTimeout(() => setItems((a) => a.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((i) => <div key={i.id} className={`toast ${i.kind}`}>{i.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const load = useCallback(async () => {
    try {
      setState((s) => ({ ...s, loading: true, error: '' }));
      setState({ data: await fn(), loading: false, error: '' });
    } catch (e) {
      setState({ data: null, loading: false, error: e.message });
    }
  }, deps); // eslint-disable-line
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export const LangSwitch = ({ light }) => {
  const { lang, setLang } = useLang();
  return (
    <div className={`lang ${light ? 'light' : ''}`} role="group" aria-label="Language">
      <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
      <button type="button" className={lang === 'mr' ? 'on' : ''} onClick={() => setLang('mr')}>मराठी</button>
    </div>
  );
};

export const Logo = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="#F59E0B" />
    <path d="M16 5v4M16 13v6M16 23v4" stroke="#0F172A" strokeWidth="3.2" strokeLinecap="round" />
  </svg>
);

export function PhotoLightbox({ photos = [], index = 0, onIndex, onClose }) {
  const { t, fmtTime } = useLang();
  const [zoom, setZoom] = useState(1);
  const p = photos[index];

  useEffect(() => {
    setZoom(1);
  }, [index]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === 'ArrowRight' && index < photos.length - 1) onIndex(index + 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, photos.length, onClose, onIndex]);

  if (!p) return null;
  return (
    <div className="lightbox" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lightbox-top">
        <div className="row wrap">
          <b style={{ textTransform: 'uppercase', letterSpacing: '.04em' }}>{p.type}</b>
          <span className="small" style={{ color: '#94A3B8' }}>{fmtTime(p.taken_at)}</span>
          <span className="small" style={{ color: '#94A3B8' }}>({index + 1} / {photos.length})</span>
        </div>
        <div className="row">
          <button type="button" className="btn sm" style={{ background: '#1E293B', color: '#fff', borderColor: '#334155' }} onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))} disabled={zoom <= 1}>
            <ZoomOut size={15} />
          </button>
          <span className="mono small" style={{ minWidth: 38, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button type="button" className="btn sm" style={{ background: '#1E293B', color: '#fff', borderColor: '#334155' }} onClick={() => setZoom((z) => Math.min(3, +(z + 0.5).toFixed(1)))} disabled={zoom >= 3}>
            <ZoomIn size={15} />
          </button>
          <button type="button" className="btn sm" style={{ background: '#1E293B', color: '#fff', borderColor: '#334155' }} onClick={() => setZoom((z) => (z === 1 ? 2 : 1))}>
            <Maximize2 size={14} /> {zoom === 1 ? '2x' : 'Fit'}
          </button>
          <a className="btn sm" style={{ background: '#1E293B', color: '#fff', borderColor: '#334155' }} href={p.file_path} download>
            <Download size={14} />
          </a>
          <button type="button" className="icon-btn" style={{ color: '#fff' }} onClick={onClose} aria-label={t('Close')}>
            <X size={22} />
          </button>
        </div>
      </div>

      <div className="lightbox-stage" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {index > 0 && (
          <button type="button" className="lightbox-nav" style={{ left: 14 }} onClick={() => onIndex(index - 1)} aria-label="Previous">
            <ChevronLeft size={22} />
          </button>
        )}
        <img
          src={p.file_path}
          alt=""
          onClick={() => setZoom((z) => (z === 1 ? 2 : 1))}
          style={{
            width: zoom > 1 ? `${zoom * 85}%` : 'auto',
            maxWidth: zoom > 1 ? 'none' : '100%',
            maxHeight: zoom > 1 ? 'none' : '100%',
            cursor: zoom > 1 ? 'zoom-out' : 'zoom-in',
          }}
        />
        {index < photos.length - 1 && (
          <button type="button" className="lightbox-nav" style={{ right: 14 }} onClick={() => onIndex(index + 1)} aria-label="Next">
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      <div className="lightbox-foot">
        <div>
          {p.latitude != null && (
            <span className="mono" style={{ color: '#FDE68A' }}>
              {(+p.latitude).toFixed(6)}, {(+p.longitude).toFixed(6)}
            </span>
          )}
          {p.accuracy_m != null && <span style={{ color: '#94A3B8' }}> &bull; ±{Math.round(p.accuracy_m)} m</span>}
          {p.distance_m != null && <span style={{ color: p.within_radius === 0 ? '#FCA5A5' : '#6EE7B7' }}> &bull; {p.distance_m} m from stop</span>}
        </div>
        <div style={{ color: '#CBD5E1' }}>{p.address || ''}</div>
      </div>
    </div>
  );
}
