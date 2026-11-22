import { config, t } from './config.js';

// Open-Meteo: free, no API key. https://open-meteo.com/en/docs
export async function fetchWeather({ lat, lon }) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    timezone: 'auto',
    forecast_days: '6',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather request failed: ${res.status}`);
  return res.json();
}

export async function searchPlaces(name) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name, count: '6', language: config.locale.split('-')[0], format: 'json' });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Place search failed: ${res.status}`);
  const { results = [] } = await res.json();
  return results.map((r) => ({ name: r.name, lat: r.latitude, lon: r.longitude, detail: [r.admin1, r.country].filter(Boolean).join(', ') }));
}

// WMO weather interpretation codes -> icon. Labels live in strings.js.
const ICONS = {
  0: 'clear',
  1: 'partly',
  2: 'partly',
  3: 'cloud',
  45: 'fog',
  48: 'fog',
  51: 'rain',
  53: 'rain',
  55: 'rain',
  56: 'sleet',
  57: 'sleet',
  61: 'rain',
  63: 'rain',
  65: 'rain',
  66: 'sleet',
  67: 'sleet',
  71: 'snow',
  73: 'snow',
  75: 'snow',
  77: 'snow',
  80: 'rain',
  81: 'rain',
  82: 'rain',
  85: 'snow',
  86: 'snow',
  95: 'storm',
  96: 'storm',
  99: 'storm',
};

export function describe(code) {
  return { label: t.conditions[code] ?? t.unknown, icon: ICONS[code] ?? 'cloud' };
}
