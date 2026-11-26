// Bulk import parsers: routes (PDF/Excel/CSV), drivers (Excel/CSV), vehicles (Excel/CSV)
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

const COORD = /(-?\d{1,3}\.\d{3,})\s*[, ]\s*(-?\d{1,3}\.\d{3,})/;
const SKIP = /^(route|campaign|advertiser|date|page|sr\.?\s*no|s\.?\s*no|no\.|stop\s*name)\b/i;

function fromLines(lines) {
  const out = [];
  for (const raw of lines) {
    let line = raw.replace(/\s+/g, ' ').trim();
    if (line.length < 4 || SKIP.test(line)) continue;
    line = line.replace(/^\d+\s*[.)\-:]\s*/, '');
    let latitude = null, longitude = null;
    const m = line.match(COORD);
    if (m) {
      latitude = +m[1];
      longitude = +m[2];
      line = line.replace(m[0], '').replace(/[()[\]]/g, '').trim();
    }
    const parts = line.split(/\s+[-\u2013\u2014|]\s+|\t/);
    const name = (parts[0] || '').trim();
    if (name.length < 3) continue;
    const address = (parts.slice(1).join(', ') || name).trim();
    out.push({ name: name.slice(0, 150), address: address.slice(0, 255), latitude, longitude, radius_m: 200 });
  }
  return out;
}

const pick = (row, re) => {
  for (const k of Object.keys(row)) if (re.test(k.trim())) return row[k];
  return '';
};

function readRows(file) {
  const ext = (file.originalname.split('.').pop() || '').toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    throw Object.assign(new Error('Upload an Excel (.xlsx/.xls) or CSV file'), { status: 400 });
  }
  const wb = XLSX.read(file.buffer, { type: 'buffer' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
}

function fromSheet(file) {
  return readRows(file).map((r) => {
    const name = String(pick(r, /^(stop|name|location|place)/i) || pick(r, /addr/i)).trim();
    const address = String(pick(r, /addr/i) || name).trim();
    const lat = parseFloat(pick(r, /^lat/i));
    const lng = parseFloat(pick(r, /^(lng|lon)/i));
    const rad = parseInt(pick(r, /radius/i), 10);
    const stay = parseInt(pick(r, /stay|min_stay/i), 10);
    const instructions = String(pick(r, /instruct|note/i) || '').trim();
    return {
      name: name.slice(0, 150),
      address: address.slice(0, 255),
      latitude: isNaN(lat) ? null : lat,
      longitude: isNaN(lng) ? null : lng,
      radius_m: rad >= 20 ? rad : 200,
      min_stay_min: stay > 0 ? stay : null,
      instructions: instructions.slice(0, 255) || null,
    };
  }).filter((s) => s.name.length >= 2);
}

async function parseRouteFile(file) {
  const ext = (file.originalname.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') {
    const data = await pdfParse(file.buffer);
    return fromLines(data.text.split(/\r?\n/));
  }
  if (['xlsx', 'xls', 'csv'].includes(ext)) return fromSheet(file);
  throw Object.assign(new Error('Upload a PDF, Excel (.xlsx) or CSV file'), { status: 400 });
}

function parseDriversFile(file) {
  return readRows(file).map((r) => {
    const name = String(pick(r, /^(name|driver|full)/i)).trim();
    const username = String(pick(r, /^(user|login)/i) || name.toLowerCase().replace(/[^a-z0-9]/g, '')).trim();
    const mobile = String(pick(r, /^(mobile|phone|contact)/i) || '').replace(/\D/g, '').slice(0, 15);
    const password = String(pick(r, /^(pass|pin)/i) || 'driver123').trim();
    return { name: name.slice(0, 120), username: username.slice(0, 60), mobile: mobile || null, password };
  }).filter((d) => d.name.length >= 2 && d.username.length >= 2);
}

function parseVehiclesFile(file) {
  return readRows(file).map((r) => {
    const number = String(pick(r, /^(number|reg|vehicle|plate)/i)).toUpperCase().replace(/\s+/g, '');
    const type = String(pick(r, /^type/i) || '').trim();
    const owner = String(pick(r, /^owner/i) || '').trim();
    return { number: number.slice(0, 30), type: type.slice(0, 40) || null, owner: owner.slice(0, 120) || null };
  }).filter((v) => v.number.length >= 4);
}

module.exports = { parseRouteFile, parseDriversFile, parseVehiclesFile };
