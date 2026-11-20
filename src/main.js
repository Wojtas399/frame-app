import './style.css';
import { config } from './config.js';
import { fetchWeather, describe } from './weather.js';
import { icon } from './icons.js';

const WEATHER_EVERY_MS = 15 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const VERSION_EVERY_MS = 5 * 60 * 1000;
const CACHE_KEY = 'weather-v1';

const $ = (id) => document.getElementById(id);
let weather = loadCached();

// The frame's own timezone may be wrong, so the clock follows the weather location's timezone.
const timeZone = () => weather?.timezone;

function fmt(options, date = new Date()) {
  return new Intl.DateTimeFormat(config.locale, { timeZone: timeZone(), ...options }).format(date);
}

function renderClock() {
  const now = new Date();
  $('time').textContent = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, now);
  $('seconds').textContent = fmt({ second: '2-digit' }, now).padStart(2, '0');
  $('date').textContent = fmt({ weekday: 'long', day: 'numeric', month: 'long' }, now);
}

const deg = (t) => `${Math.round(t)}°`;
// Open-Meteo returns local wall-clock strings like "2026-11-20T17:00".
const hhmm = (s) => s.slice(11, 16);
const weekday = (isoDate) =>
  new Intl.DateTimeFormat(config.locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${isoDate}T12:00Z`));

function renderWeather() {
  if (!weather) return;
  const { current: c, hourly: h, daily: d } = weather;
  const now = describe(c.weather_code);

  $('place').textContent = config.place;
  $('now').innerHTML = `
    <div class="now-main">
      ${icon(now.icon, c.is_day === 1)}
      <div class="now-temp">${deg(c.temperature_2m)}</div>
    </div>
    <div class="now-label">${now.label}</div>
    <div class="now-range">H ${deg(d.temperature_2m_max[0])} · L ${deg(d.temperature_2m_min[0])}</div>
    <dl class="now-details">
      <div><dt>Feels like</dt><dd>${deg(c.apparent_temperature)}</dd></div>
      <div><dt>Wind</dt><dd>${Math.round(c.wind_speed_10m)} km/h</dd></div>
      <div><dt>Humidity</dt><dd>${c.relative_humidity_2m}%</dd></div>
      <div><dt>Sun</dt><dd>${hhmm(d.sunrise[0])}–${hhmm(d.sunset[0])}</dd></div>
    </dl>`;

  const start = Math.max(0, h.time.indexOf(`${c.time.slice(0, 13)}:00`)) + 1;
  $('hours').innerHTML = h.time
    .slice(start, start + 8)
    .map((t, j) => {
      const i = start + j;
      const rain = h.precipitation_probability[i];
      return `<div class="hour">
        <div class="hour-time">${hhmm(t)}</div>
        ${icon(describe(h.weather_code[i]).icon, h.is_day[i] === 1)}
        <div class="hour-temp">${deg(h.temperature_2m[i])}</div>
        <div class="rain ${rain >= 30 ? 'likely' : ''}">${rain}%</div>
      </div>`;
    })
    .join('');

  $('days').innerHTML = d.time
    .slice(1, 6)
    .map((day, j) => {
      const i = j + 1;
      const rain = d.precipitation_probability_max[i];
      return `<div class="day">
        <div class="day-name">${weekday(day)}</div>
        ${icon(describe(d.weather_code[i]).icon)}
        <div class="day-temps"><span class="hi">${deg(d.temperature_2m_max[i])}</span><span class="lo">${deg(d.temperature_2m_min[i])}</span></div>
        <div class="rain ${rain >= 30 ? 'likely' : ''}">${rain}%</div>
      </div>`;
    })
    .join('');
}

function setStatus(text, isError = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('error', isError);
}

let weatherTimer;
async function refreshWeather() {
  clearTimeout(weatherTimer);
  try {
    weather = await fetchWeather(config);
    saveCached(weather);
    renderClock();
    renderWeather();
    setStatus(`Updated ${fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`);
    weatherTimer = setTimeout(refreshWeather, WEATHER_EVERY_MS);
  } catch (err) {
    console.error(err);
    setStatus(weather ? `Offline · showing ${hhmm(weather.current.time)} data` : 'Waiting for weather…', true);
    weatherTimer = setTimeout(refreshWeather, RETRY_MS);
  }
}

function loadCached() {
  try {
    const w = JSON.parse(localStorage.getItem(CACHE_KEY));
    return w && w.latitude.toFixed(1) === config.lat.toFixed(1) && w.longitude.toFixed(1) === config.lon.toFixed(1) ? w : null;
  } catch {
    return null;
  }
}

function saveCached(w) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(w));
  } catch {}
}

// Reload when a new version is deployed, so a push to GitHub shows up on the frame by itself.
let loadedVersion;
async function checkVersion() {
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const { sha } = await res.json();
      if (loadedVersion && sha !== loadedVersion) location.reload();
      loadedVersion = sha;
    }
  } catch {}
}

renderClock();
renderWeather();
setInterval(renderClock, 1000);
refreshWeather();
checkVersion();
setInterval(checkVersion, VERSION_EVERY_MS);
// Tap anywhere to refresh the weather now.
document.addEventListener('click', refreshWeather);
