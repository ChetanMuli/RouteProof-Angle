// Burns a clear GPS Map Camera style proof panel onto the photo so location, time, vehicle & stop travel with the image.
const LABEL = { arrival: 'ARRIVAL PHOTO', interval: 'DURING VISIT', departure: 'DEPARTURE PHOTO' };

const coord = (v, pos, neg) => `${Math.abs(v).toFixed(6)}\u00B0 ${v >= 0 ? pos : neg}`;

function wrap(ctx, text, maxW, maxLines) {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,3}$/, '...');
  }
  return lines;
}

export function stampImage(source, info) {
  const sw = source.videoWidth || source.naturalWidth || source.width;
  const sh = source.videoHeight || source.naturalHeight || source.height;
  const scale = Math.min(1, 1440 / Math.max(sw, sh));
  const W = Math.round(sw * scale);
  const H = Math.round(sh * scale);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, W, H);

  // Base unit scales smoothly for both portrait phone shots and landscape photos
  const u = Math.max(Math.min(W, H) / 36, 11);
  const pad = u * 0.95;
  const gap = u * 1.38;
  const font = (size, weight = 400) => `${weight} ${size}px Inter, "Noto Sans Devanagari", system-ui, sans-serif`;
  const maxTextW = W - pad * 2 - u * 0.8;

  const now = info.takenAt || new Date();
  const when = now.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZoneName: 'short',
  });

  ctx.font = font(u * 0.92, 500);
  const addrLines = wrap(ctx, info.address || 'Address unavailable', maxTextW, 3);
  const metaText = `${info.campaign}  •  Stop #${info.seq || ''} ${info.stop}`.trim();
  const metaLines = wrap(ctx, metaText, maxTextW, 2);

  const distPart = info.distanceM != null ? `  •  ${info.distanceM} m from stop` : '';
  const accPart = info.accuracy ? `  •  \u00B1${Math.round(info.accuracy)} m` : '';

  const rows = [
    { t: `${coord(info.lat, 'N', 'S')},  ${coord(info.lng, 'E', 'W')}${accPart}${distPart}`, size: u * 1.06, weight: 700, color: '#FDE68A' },
    ...addrLines.map((t) => ({ t, size: u * 0.92, weight: 500, color: '#FFFFFF' })),
    { t: `${when}   |   Vehicle: ${info.vehicle}`, size: u * 0.88, weight: 600, color: '#E2E8F0' },
    ...metaLines.map((t) => ({ t, size: u * 0.85, weight: 500, color: '#CBD5E1' })),
  ];

  const panelH = pad * 1.6 + rows.length * gap + u * 0.7;
  const top = H - panelH;

  // Semi-opaque dark slate backdrop + subtle top border
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.fillRect(0, top, W, panelH);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.fillRect(0, top, W, 1.5);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(0, top, u * 0.36, panelH);

  // Top-left photo type badge
  ctx.font = font(u * 0.8, 700);
  const label = LABEL[info.type] || 'PHOTO';
  const tagW = ctx.measureText(label).width + u * 1.3;
  const tagH = u * 1.5;
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(pad + u * 0.25, top - tagH / 2, tagW, tagH);
  ctx.fillStyle = '#0F172A';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, pad + u * 0.9, top);

  // Top-right radius badge (if stop coordinates exist)
  if (info.distanceM != null && info.radiusM != null) {
    const ok = info.distanceM <= info.radiusM;
    const statusTxt = ok ? `AT STOP (${info.distanceM} m)` : `OUTSIDE RADIUS (${info.distanceM} m)`;
    const stW = ctx.measureText(statusTxt).width + u * 1.2;
    ctx.fillStyle = ok ? '#059669' : '#DC2626';
    ctx.fillRect(W - pad - stW, top - tagH / 2, stW, tagH);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(statusTxt, W - pad - stW + u * 0.6, top);
  }

  ctx.textBaseline = 'alphabetic';
  let y = top + pad * 1.25 + u * 0.85;
  rows.forEach((r) => {
    ctx.font = font(r.size, r.weight);
    ctx.fillStyle = r.color;
    ctx.fillText(r.t, pad + u * 0.65, y);
    y += gap;
  });

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the photo'))), 'image/jpeg', 0.9)
  );
}
