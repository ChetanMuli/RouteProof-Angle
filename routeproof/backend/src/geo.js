// Helpers: distance calculation and best-effort geocoding via OpenStreetMap Nominatim
const UA = { 'User-Agent': 'RouteProofDemo/2.0 (fleet-proof-of-display)', 'Accept-Language': 'en' };

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

async function getJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5500);
  try {
    const r = await fetch(url, { headers: UA, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function geocode(text) {
  const j = await getJson('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' + encodeURIComponent(text));
  return j && j[0] ? { latitude: +j[0].lat, longitude: +j[0].lon } : null;
}

async function geocodeSearch(text) {
  const j = await getJson('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=' + encodeURIComponent(text));
  if (!Array.isArray(j)) return [];
  return j.map((item) => ({
    name: (item.name || item.display_name?.split(',')[0] || '').trim(),
    address: item.display_name || '',
    latitude: +item.lat,
    longitude: +item.lon,
  }));
}

async function reverse(lat, lng) {
  const j = await getJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`);
  return j && j.display_name ? j.display_name : null;
}

module.exports = { haversine, geocode, geocodeSearch, reverse };
