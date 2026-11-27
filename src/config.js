// Defaults, overridable with URL query params, e.g.
//   ?lat=50.06&lon=19.94&place=Kraków
// A location picked on the frame (localStorage `location-v1`) beats both.
import { STRINGS } from './strings.js';
import { fetchFeed } from './calendar.js';
import { fetchTraining } from './training.js';

const params = new URLSearchParams(location.search);
const LOCATION_KEY = 'location-v1';

function savedLocation() {
  try {
    const l = JSON.parse(localStorage.getItem(LOCATION_KEY));
    return typeof l?.name === 'string' && Number.isFinite(l.lat) && Number.isFinite(l.lon) ? l : null;
  } catch {
    return null;
  }
}

export function saveLocation({ name, lat, lon }) {
  try {
    localStorage.setItem(LOCATION_KEY, JSON.stringify({ name, lat, lon }));
  } catch {}
}

const place = savedLocation() ?? {
  name: params.get('place') ?? 'Warsaw',
  lat: Number(params.get('lat') ?? 52.2297),
  lon: Number(params.get('lon') ?? 21.0122),
};

export const config = {
  lat: place.lat,
  lon: place.lon,
  place: place.name,
  locale: params.get('locale') ?? 'en-GB',
};

export const t = STRINGS[config.locale.split('-')[0]] ?? STRINGS.en;

// `url` names the source, so a cached feed is dropped when it changes. `fetch` loads a window of it as calendar feed events.
export const accounts = [
  { id: 'private', label: t.private, color: '#7cc4ff', url: params.get('cal-private'), fetch: fetchFeed },
  { id: 'business', label: t.business, color: '#ffad5a', url: params.get('cal-business'), fetch: fetchFeed },
  { id: 'training', label: t.training, color: '#5ee08a', url: params.get('intervals'), fetch: fetchTraining },
]
  .filter((a) => a.url)
  .map(({ fetch, ...a }) => ({ ...a, fetch: (win) => fetch(a.url, win) }));
