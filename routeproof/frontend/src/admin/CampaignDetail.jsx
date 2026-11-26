import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowLeft, CheckCircle2, Circle, Copy, Download, FileText, GripVertical, MapPin, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { api, downloadFile } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLang } from '../i18n.jsx';
import { RouteMap, StopPinPicker } from '../MapViews.jsx';
import { Empty, Field, Modal, Spinner, StatusBadge, useLoad, useToast } from '../ui.jsx';
import { addDays, haversineMeters, localISO } from '../utils.js';

/* ---- Edit campaign modal ---- */
function EditCampaignModal({ campaign, onClose, onSaved }) {
  const { t } = useLang();
  const toast = useToast();
  const [f, setF] = useState({
    advertiser: campaign.advertiser,
    name: campaign.name,
    start_date: campaign.start_date,
    end_date: campaign.end_date,
    photo_interval_min: campaign.photo_interval_min,
    min_stay_min: campaign.min_stay_min,
    notes: campaign.notes || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      await api(`/campaigns/${campaign.id}`, { method: 'PATCH', body: f });
      toast(t('Campaign updated'));
      onSaved();
    } catch (e) {
      toast(e.message, 'err');
      setBusy(false);
    }
  };
  return (
    <Modal
      title={t('Edit campaign')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Cancel')}</button>
          <button className="btn primary" disabled={busy || !f.advertiser.trim() || !f.name.trim()} onClick={save}>{t('Save')}</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('Advertiser (client name)')} full><input className="input" value={f.advertiser} onChange={set('advertiser')} /></Field>
        <Field label={t('Campaign name')} full><input className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label={t('Start date')}><input className="input" type="date" value={f.start_date} onChange={set('start_date')} /></Field>
        <Field label={t('End date')}><input className="input" type="date" value={f.end_date} onChange={set('end_date')} /></Field>
        <Field label={t('Photo every (minutes) while at a stop')}><input className="input" type="number" min="1" value={f.photo_interval_min} onChange={set('photo_interval_min')} /></Field>
        <Field label={t('Minimum stay at each stop (minutes)')}><input className="input" type="number" min="0" value={f.min_stay_min} onChange={set('min_stay_min')} /></Field>
        <Field label={t('Notes for drivers')} full><textarea className="input" value={f.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

/* ---- Add / edit stop with interactive map pin picker & address search ---- */
function StopForm({ campaignId, stop, onClose, onSaved }) {
  const { t } = useLang();
  const toast = useToast();
  const [f, setF] = useState({ name: '', address: '', latitude: '', longitude: '', radius_m: 200, min_stay_min: '', instructions: '', ...(stop || {}) });
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const searchAddress = async (textOverride) => {
    const q = (textOverride ?? query).trim();
    if (q.length < 2) return;
    setSearching(true);
    try {
      const res = await api('/geo/search?q=' + encodeURIComponent(q));
      setHits(res);
      if (!res.length) toast('No matching map locations found. Click the map to drop a pin.', 'err');
    } catch (e) {
      toast(e.message, 'err');
    }
    setSearching(false);
  };

  const save = async () => {
    setBusy(true);
    try {
      if (stop) await api(`/stops/${stop.id}`, { method: 'PATCH', body: f });
      else await api(`/campaigns/${campaignId}/stops`, { method: 'POST', body: f });
      onSaved();
    } catch (e) {
      toast(e.message, 'err');
      setBusy(false);
    }
  };

  return (
    <Modal
      size="mid"
      title={stop ? t('Edit stop') : t('Add stop')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Cancel')}</button>
          <button className="btn primary" disabled={busy || !f.name.trim()} onClick={save}>{t('Save stop')}</button>
        </>
      }
    >
      <div className="stack">
        <div className="form-grid">
          <Field label={t('Stop name')} full><input className="input" value={f.name} onChange={set('name')} autoFocus /></Field>
          <Field label={t('Address')} full>
            <div className="row">
              <input className="input" value={f.address || ''} onChange={set('address')} placeholder="e.g. Shaniwar Peth, Pune" />
              <button
                type="button"
                className="btn sm nowrap"
                disabled={searching || (!f.address?.trim() && !f.name?.trim())}
                onClick={() => {
                  const text = f.address?.trim() || f.name?.trim();
                  setQuery(text);
                  searchAddress(text);
                }}
              >
                <MapPin size={14} /> Find GPS
              </button>
            </div>
          </Field>
          <Field label={t('Allowed distance (metres)')}><input className="input" type="number" min="20" value={f.radius_m} onChange={set('radius_m')} /></Field>
          <Field label={t('Minimum stay at each stop (minutes)')}><input className="input" type="number" min="0" placeholder="Campaign default" value={f.min_stay_min ?? ''} onChange={set('min_stay_min')} /></Field>
          <Field label={t('Instructions for driver')} full><input className="input" value={f.instructions || ''} onChange={set('instructions')} /></Field>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <div className="row">
            <input
              className="input"
              placeholder={t('Search address on map')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchAddress())}
            />
            <button type="button" className="btn" onClick={() => searchAddress()} disabled={searching}><Search size={15} /> {t('Search')}</button>
          </div>
          {hits.length > 0 && (
            <div className="card" style={{ padding: 6, maxHeight: 130, overflowY: 'auto' }}>
              {hits.map((h, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="btn sm"
                  style={{ width: '100%', justifyContent: 'flex-start', border: 0, textAlign: 'left', marginBottom: 2 }}
                  onClick={() => {
                    setF((prev) => ({
                      ...prev,
                      name: prev.name || h.name,
                      address: prev.address || h.address.slice(0, 200),
                      latitude: h.latitude,
                      longitude: h.longitude,
                    }));
                    setHits([]);
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.address}</span>
                </button>
              ))}
            </div>
          )}
          <StopPinPicker
            lat={f.latitude}
            lng={f.longitude}
            radius={f.radius_m}
            onPick={(lat, lng) => setF((prev) => ({ ...prev, latitude: lat, longitude: lng }))}
          />
          <div className="form-grid">
            <Field label={t('Latitude')}><input className="input mono" inputMode="decimal" value={f.latitude ?? ''} onChange={set('latitude')} placeholder="18.5195" /></Field>
            <Field label={t('Longitude')}><input className="input mono" inputMode="decimal" value={f.longitude ?? ''} onChange={set('longitude')} placeholder="73.8553" /></Field>
          </div>
          <p className="muted small" style={{ margin: 0 }}>{t('Click or drag pin on map to set exact stop location')}</p>
        </div>
      </div>
    </Modal>
  );
}

/* ---- Import route from PDF / Excel / CSV ---- */
function ImportModal({ campaignId, onClose, onSaved }) {
  const { t } = useLang();
  const toast = useToast();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null), [geo, setGeo] = useState(false), [busy, setBusy] = useState(false), [rows, setRows] = useState(null), [err, setErr] = useState('');

  const read = async () => {
    setBusy(true); setErr('');
    const form = new FormData(); form.append('file', file);
    try {
      const r = await api(`/campaigns/${campaignId}/import/preview${geo ? '?geocode=1' : ''}`, { method: 'POST', form });
      setRows(r.stops);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const edit = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v, warn: null } : r)));
  const save = async () => {
    setBusy(true);
    try {
      const r = await api(`/campaigns/${campaignId}/stops/bulk`, { method: 'POST', body: { stops: rows, source: file.name } });
      toast(t('{n} stops added', { n: r.saved }));
      onSaved();
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  const template = () => {
    const csv = 'Stop,Address,Latitude,Longitude,Radius,Instructions\nShaniwar Wada,"Shaniwar Peth, Pune",18.5195,73.8553,250,Main gate bay\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'route-template.csv' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <Modal
      size="wide"
      title={t('Import route')}
      onClose={onClose}
      footer={
        rows ? (
          <>
            <button className="btn" onClick={() => setRows(null)}>{t('Back')}</button>
            <button className="btn primary" disabled={busy || !rows.length} onClick={save}>{t('Save {n} stops', { n: rows.length })}</button>
          </>
        ) : (
          <>
            <button className="btn" onClick={onClose}>{t('Cancel')}</button>
            <button className="btn primary" disabled={!file || busy} onClick={read}>{busy ? t('Reading file...') : t('Read file')}</button>
          </>
        )
      }
    >
      {!rows ? (
        <div className="stack">
          <p style={{ margin: 0 }}>{t("Upload the route file your client sent. We read the stops for you; you check them before anything is saved.")}</p>
          <div className="row wrap">
            <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv" hidden onChange={(e) => setFile(e.target.files[0] || null)} />
            <button className="btn" onClick={() => fileRef.current.click()}><Upload size={16} /> {file ? file.name : t('Choose PDF, Excel or CSV')}</button>
            <button className="btn sm" onClick={template}><Download size={14} /> {t('Download Excel/CSV template')}</button>
          </div>
          <label className="check">
            <input type="checkbox" checked={geo} onChange={(e) => setGeo(e.target.checked)} />
            <span>{t('Find map locations for stops without GPS (needs internet, takes about a second per stop)')}</span>
          </label>
          {err && <p className="error-text">{err}</p>}
        </div>
      ) : (
        <div className="stack">
          <p style={{ margin: 0 }}>{t('Check each stop. Fix names or locations, or remove rows you do not need.')}</p>
          {err && <p className="error-text">{err}</p>}
          <div className="table-wrap card">
            <table>
              <thead><tr><th>#</th><th>{t('Stop name')}</th><th>{t('Address')}</th><th>{t('Latitude')}</th><th>{t('Longitude')}</th><th /></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={r.warn ? { background: '#FFFBEB' } : null}>
                    <td>{i + 1}</td>
                    <td><input className="input" value={r.name} onChange={(e) => edit(i, 'name', e.target.value)} /></td>
                    <td><input className="input" value={r.address || ''} onChange={(e) => edit(i, 'address', e.target.value)} /></td>
                    <td style={{ width: 120 }}><input className="input mono" value={r.latitude ?? ''} onChange={(e) => edit(i, 'latitude', e.target.value)} /></td>
                    <td style={{ width: 120 }}><input className="input mono" value={r.longitude ?? ''} onChange={(e) => edit(i, 'longitude', e.target.value)} /></td>
                    <td className="nowrap">
                      {r.warn && <span className="badge warn">{t(r.warn)}</span>}{' '}
                      <button className="icon-btn" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={t('Remove')}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---- Daily driver assignment with optional per-driver stop splitting ---- */
function DriversTab({ campaign, stops, canAssign, onSaved }) {
  const { t } = useLang();
  const toast = useToast();
  const [date, setDate] = useState(localISO());
  const { data, loading, reload } = useLoad(() => api(`/campaigns/${campaign.id}/assignments?date=${date}`), [date]);
  const [draft, setDraft] = useState(null);

  const getMap = () => {
    if (draft) return draft;
    const m = new Map();
    (data?.drivers || []).forEach((d) => { if (d.assigned) m.set(d.id, d.stop_ids || null); });
    return m;
  };

  const selMap = getMap();
  const toggleDriver = (id) => {
    const next = new Map(selMap);
    if (next.has(id)) next.delete(id);
    else next.set(id, null);
    setDraft(next);
  };

  const toggleSplitMode = (id) => {
    const next = new Map(selMap);
    const cur = next.get(id);
    next.set(id, cur === null ? stops.map((s) => s.id) : null);
    setDraft(next);
  };

  const toggleStop = (driverId, stopId) => {
    const next = new Map(selMap);
    const cur = next.get(driverId) || [];
    const updated = cur.includes(stopId) ? cur.filter((x) => x !== stopId) : [...cur, stopId];
    next.set(driverId, updated);
    setDraft(next);
  };

  const copyYesterday = async () => {
    try {
      const yDate = addDays(date, -1);
      const y = await api(`/campaigns/${campaign.id}/assignments?date=${yDate}`);
      const next = new Map();
      (y.drivers || []).forEach((d) => { if (d.assigned) next.set(d.id, d.stop_ids || null); });
      if (!next.size) { toast('No drivers were assigned on the previous day', 'err'); return; }
      setDraft(next);
      toast(`Loaded ${next.size} driver(s) from ${yDate} — click Save to confirm`);
    } catch (e) { toast(e.message, 'err'); }
  };

  const save = async () => {
    const assignments = [...selMap.entries()].map(([driver_id, stop_ids]) => ({ driver_id, stop_ids }));
    try {
      const r = await api(`/campaigns/${campaign.id}/assignments`, { method: 'PUT', body: { date, assignments } });
      toast(t('{n} drivers assigned', { n: r.count }));
      setDraft(null);
      reload();
      if (onSaved) onSaved();
    } catch (e) { toast(e.message, 'err'); }
  };

  const outOfRange = date < campaign.start_date || date > campaign.end_date;

  return (
    <div className="stack" style={{ maxWidth: 780 }}>
      <div className="row wrap" style={{ alignItems: 'flex-end' }}>
        <Field label={t('Date')}>
          <input className="input" type="date" value={date} onChange={(e) => { setDraft(null); setDate(e.target.value); }} style={{ maxWidth: 200 }} />
        </Field>
        {canAssign && (
          <button type="button" className="btn sm" onClick={copyYesterday}>
            <Copy size={14} /> Copy previous day
          </button>
        )}
      </div>

      {outOfRange && (
        <div className="banner">
          <div>Selected date ({date}) is outside this campaign&apos;s active window ({campaign.start_date} to {campaign.end_date}). Drivers only see campaigns active on today&apos;s date.</div>
        </div>
      )}

      {loading ? <Spinner /> : !data.drivers.length ? (
        <div className="card"><Empty title={t('No drivers yet')} text={t('Add drivers first, then assign them here.')} /></div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {data.drivers.map((d) => {
            const isAssigned = selMap.has(d.id);
            const splitIds = selMap.get(d.id);
            return (
              <div key={d.id} className="card card-pad" style={{ padding: '12px 16px' }}>
                <div className="row spread wrap">
                  <label className="row" style={{ cursor: canAssign ? 'pointer' : 'default' }}>
                    <input type="checkbox" disabled={!canAssign} checked={isAssigned} onChange={() => toggleDriver(d.id)} style={{ width: 17, height: 17, accentColor: 'var(--route)' }} />
                    <span><b>{d.name}</b> <span className="muted small">{d.mobile}</span></span>
                  </label>
                  <div className="row">
                    {isAssigned && stops.length > 0 && canAssign && (
                      <button type="button" className="btn sm" onClick={() => toggleSplitMode(d.id)}>
                        {splitIds === null ? t('All stops') : `${t('Split stops')} (${splitIds.length}/${stops.length})`}
                      </button>
                    )}
                    {d.vehicle_number ? <span className="badge ok">{d.vehicle_number}</span> : <span className="small muted">{t('Vehicle not selected')}</span>}
                  </div>
                </div>
                {isAssigned && splitIds !== null && stops.length > 0 && (
                  <div className="row wrap" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)', gap: 8 }}>
                    {stops.map((s) => (
                      <label key={s.id} className="check" style={{ padding: '5px 10px', fontSize: 12.5 }}>
                        <input type="checkbox" disabled={!canAssign} checked={splitIds.includes(s.id)} onChange={() => toggleStop(d.id, s.id)} />
                        <span>{s.seq}. {s.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {canAssign && (
        <div className="row">
          <button className="btn primary" onClick={save}>{t('Save drivers for this day')}</button>
          <span className="small muted">{selMap.size} selected</span>
        </div>
      )}
    </div>
  );
}

export default function CampaignDetail() {
  const { id } = useParams();
  const { t, lang, fmtDate, fmtTime } = useLang();
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api(`/campaigns/${id}`), [id]);
  const { data: todayAssign, reload: reloadAssign } = useLoad(() => api(`/campaigns/${id}/assignments?date=${localISO()}`), [id]);
  const [tab, setTab] = useState('route');
  const [stopForm, setStopForm] = useState(null);
  const [editCamp, setEditCamp] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);

  if (loading && !data) return <Spinner />;
  if (error) return <p className="error-text">{error}</p>;
  const { campaign: c, stops, history } = data;
  const canEdit = can('campaigns');

  const assignedTodayCount = (todayAssign?.drivers || []).filter((d) => d.assigned).length;
  const missingGpsCount = stops.filter((s) => s.latitude == null || s.longitude == null).length;

  // Approximate total route distance across sequential stops that have coordinates
  let routeMeters = 0;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i];
    if (a.latitude != null && a.longitude != null && b.latitude != null && b.longitude != null) {
      routeMeters += haversineMeters(+a.latitude, +a.longitude, +b.latitude, +b.longitude) || 0;
    }
  }

  const saveOrder = async (nextStops) => {
    try {
      await api(`/campaigns/${id}/stops/reorder`, { method: 'POST', body: { ids: nextStops.map((s) => s.id) } });
      reload();
    } catch (e) { toast(e.message, 'err'); }
  };

  const move = async (i, dir) => {
    const copy = [...stops];
    [copy[i], copy[i + dir]] = [copy[i + dir], copy[i]];
    await saveOrder(copy);
  };

  const onDrop = async (targetIdx) => {
    if (dragIdx === null || dragIdx === targetIdx) return;
    const copy = [...stops];
    const [item] = copy.splice(dragIdx, 1);
    copy.splice(targetIdx, 0, item);
    setDragIdx(null);
    await saveOrder(copy);
  };

  const remove = async (s) => {
    if (!confirm(t('Remove "{name}" from this route?', { name: s.name }))) return;
    try {
      await api(`/stops/${s.id}`, { method: 'DELETE' });
      toast(t('Stop removed'));
      reload();
    } catch (e) { toast(e.message, 'err'); }
  };

  const setStatus = async (status) => {
    try {
      await api(`/campaigns/${id}`, { method: 'PATCH', body: { status } });
      reload();
    } catch (e) { toast(e.message, 'err'); }
  };

  const exportReport = async (path, filename) => {
    try { await downloadFile(path, filename); } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <>
      <Link to="/admin/campaigns" className="row small" style={{ marginBottom: 10, textDecoration: 'none' }}>
        <ArrowLeft size={15} /> {t('Campaigns')}
      </Link>

      <div className="page-head">
        <div>
          <div className="muted small">{c.advertiser} &bull; Route v{c.route_version}</div>
          <h1>{c.name}</h1>
          <p>{fmtDate(c.start_date)} – {fmtDate(c.end_date)} &bull; {t('Photo every {n} min at a stop', { n: c.photo_interval_min })} &bull; {t('Min stay {n} min', { n: c.min_stay_min })}</p>
        </div>
        <div className="row wrap">
          <StatusBadge status={c.status} />
          {canEdit && (
            <>
              <button className="btn sm" onClick={() => setEditCamp(true)}><Pencil size={14} /> {t('Edit')}</button>
              <select className="input" style={{ width: 'auto' }} value={c.status} onChange={(e) => setStatus(e.target.value)}>
                <option value="active">{t('Active')}</option>
                <option value="paused">{t('Paused')}</option>
                <option value="closed">{t('Closed')}</option>
              </select>
            </>
          )}
          {can('reports') && (
            <button className="btn sm" onClick={() => exportReport(`/reports/campaign/${id}?format=pdf&lang=${lang}`, `campaign-${id}-proof.pdf`)}>
              <FileText size={14} /> {t('Export photo report (PDF)')}
            </button>
          )}
        </div>
      </div>

      {/* 3-Step Campaign Setup Flow Bar */}
      <div className="card card-pad row wrap spread" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div className="row wrap" style={{ gap: 18 }}>
          <span className="row small"><CheckCircle2 size={16} color="var(--route)" /> <b>1. Campaign active</b></span>
          <button type="button" className="btn sm" style={{ border: 0, background: 'transparent', padding: 0 }} onClick={() => setTab('route')}>
            {stops.length > 0 ? <CheckCircle2 size={16} color="var(--route)" /> : <Circle size={16} color="var(--muted)" />}
            <b>2. Route ({stops.length} stops)</b>
          </button>
          <button type="button" className="btn sm" style={{ border: 0, background: 'transparent', padding: 0 }} onClick={() => setTab('drivers')}>
            {assignedTodayCount > 0 ? <CheckCircle2 size={16} color="var(--route)" /> : <Circle size={16} color="var(--muted)" />}
            <b>3. Today&apos;s drivers ({assignedTodayCount} assigned)</b>
          </button>
        </div>
        {stops.length > 0 && (
          <div className="row wrap small muted">
            <span>{(routeMeters / 1000).toFixed(1)} km route</span>
            {missingGpsCount > 0 && <span className="badge warn">{missingGpsCount} missing GPS</span>}
          </div>
        )}
      </div>

      {c.notes && <div className="banner" style={{ marginBottom: 18 }}>{c.notes}</div>}

      <div className="tabs">
        <button className={`tab ${tab === 'route' ? 'on' : ''}`} onClick={() => setTab('route')}>{t('Route')} ({stops.length})</button>
        <button className={`tab ${tab === 'drivers' ? 'on' : ''}`} onClick={() => setTab('drivers')}>{t('Drivers')}</button>
        <button className={`tab ${tab === 'history' ? 'on' : ''}`} onClick={() => setTab('history')}>{t('Route history')} ({history.length})</button>
      </div>

      {tab === 'route' && (
        <div className="stack">
          <div className="row wrap spread">
            <div className="row wrap">
              {canEdit && (
                <>
                  <button className="btn primary" onClick={() => setImporting(true)}><Upload size={16} /> {t('Import route')}</button>
                  <button className="btn" onClick={() => setStopForm({})}><Plus size={16} /> {t('Add stop')}</button>
                </>
              )}
            </div>
            {can('reports') && stops.length > 0 && (
              <div className="row">
                <button className="btn sm" onClick={() => exportReport(`/reports/stops?campaign_id=${id}&format=xlsx&lang=${lang}`, `stops-${id}.xlsx`)}>
                  <Download size={14} /> {t('Export stop list')} (Excel)
                </button>
                <button className="btn sm" onClick={() => exportReport(`/reports/stops?campaign_id=${id}&format=pdf`, `stops-${id}.pdf`)}>
                  <FileText size={14} /> PDF
                </button>
              </div>
            )}
          </div>

          <div className="split-grid">
            <div className="card table-wrap">
              {!stops.length ? (
                <Empty title={t('No stops yet')} text={t('Import the route file from your client, or add stops one by one.')} />
              ) : (
                <table>
                  <thead><tr><th style={{ width: 30 }} /><th>#</th><th>{t('Stop')}</th><th>{t('GPS location')}</th><th>{t('Allowed distance')}</th>{canEdit && <th />}</tr></thead>
                  <tbody>
                    {stops.map((s, i) => (
                      <tr
                        key={s.id}
                        draggable={canEdit}
                        onDragStart={() => setDragIdx(i)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => onDrop(i)}
                      >
                        <td className="muted">{canEdit && <GripVertical size={15} style={{ cursor: 'grab' }} />}</td>
                        <td><b>{s.seq}</b></td>
                        <td>
                          <b>{s.name}</b>
                          <div className="small muted">{s.address}</div>
                        </td>
                        <td className="nowrap mono">
                          {s.latitude != null ? `${(+s.latitude).toFixed(4)}, ${(+s.longitude).toFixed(4)}` : <span className="badge warn">{t('Missing')}</span>}
                        </td>
                        <td className="nowrap">{s.radius_m} m</td>
                        {canEdit && (
                          <td className="nowrap right">
                            <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('Move up')}><ArrowUp size={15} /></button>
                            <button className="icon-btn" disabled={i === stops.length - 1} onClick={() => move(i, 1)} aria-label={t('Move down')}><ArrowDown size={15} /></button>
                            <button className="icon-btn" onClick={() => setStopForm(s)} aria-label={t('Edit stop')}><Pencil size={15} /></button>
                            <button className="icon-btn" onClick={() => remove(s)} aria-label={t('Remove')}><Trash2 size={15} /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="card card-pad" style={{ padding: 12 }}>
              <RouteMap stops={stops} height={380} />
            </div>
          </div>
        </div>
      )}

      {tab === 'drivers' && <DriversTab campaign={c} stops={stops} canAssign={can('assign')} onSaved={reloadAssign} />}

      {tab === 'history' && (
        <div className="card table-wrap">
          {!history.length ? <Empty title={t('No activity yet')} /> : (
            <table>
              <thead><tr><th>{t('When')}</th><th>{t('Who')}</th><th>{t('Action')}</th><th>{t('Details')}</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="nowrap small">{fmtDate(h.created_at)} {fmtTime(h.created_at)}</td>
                    <td>{h.user_name || '-'}</td>
                    <td><b>{h.action.replace(/_/g, ' ')}</b></td>
                    <td className="small muted" style={{ maxWidth: 420, overflowWrap: 'anywhere' }}>{h.new_value || h.details || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {editCamp && <EditCampaignModal campaign={c} onClose={() => setEditCamp(false)} onSaved={() => { setEditCamp(false); reload(); }} />}
      {stopForm && <StopForm campaignId={id} stop={stopForm.id ? stopForm : null} onClose={() => setStopForm(null)} onSaved={() => { setStopForm(null); reload(); }} />}
      {importing && <ImportModal campaignId={id} onClose={() => setImporting(false)} onSaved={() => { setImporting(false); reload(); }} />}
    </>
  );
}
