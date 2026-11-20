// Inline SVG icons; Android 6's emoji font is too old to rely on.
const sun = '<circle cx="32" cy="32" r="11" fill="var(--sun)"/><g stroke="var(--sun)" stroke-width="4" stroke-linecap="round"><path d="M32 6v7M32 51v7M6 32h7M51 32h7M13.6 13.6l5 5M45.4 45.4l5 5M13.6 50.4l5-5M45.4 18.6l5-5"/></g>';
const moon = '<path d="M40 10a22 22 0 1 0 14 34A18 18 0 0 1 40 10z" fill="var(--moon)"/>';
const cloudPath = '<path d="M20 50h26a11 11 0 0 0 1-22 15 15 0 0 0-29 3 9.5 9.5 0 0 0 2 19z" fill="var(--cloud)"/>';
const smallSun = '<g transform="translate(-8 -10) scale(.75)">' + sun + '</g>';
const smallMoon = '<g transform="translate(-6 -8) scale(.7)">' + moon + '</g>';
const drops = '<g stroke="var(--rain)" stroke-width="4" stroke-linecap="round"><path d="M24 54l-3 7M34 54l-3 7M44 54l-3 7"/></g>';
const flakes = '<g fill="var(--snow)"><circle cx="22" cy="58" r="3"/><circle cx="33" cy="60" r="3"/><circle cx="44" cy="58" r="3"/></g>';
const bolt = '<path d="M34 46l-8 12h7l-4 10 11-14h-7l4-8z" fill="var(--sun)"/>';
const fogLines = '<g stroke="var(--cloud)" stroke-width="4" stroke-linecap="round"><path d="M12 24h40M8 34h48M12 44h40M18 54h28"/></g>';

const ICONS = {
  clear: (day) => (day ? sun : moon),
  partly: (day) => (day ? smallSun : smallMoon) + cloudPath,
  cloud: () => cloudPath,
  fog: () => fogLines,
  rain: () => cloudPath + drops,
  sleet: () => cloudPath + drops.replace('M44 54l-3 7', '') + '<circle cx="44" cy="58" r="3" fill="var(--snow)"/>',
  snow: () => cloudPath + flakes,
  storm: () => cloudPath + bolt,
};

export function icon(name, isDay = true) {
  const body = (ICONS[name] ?? ICONS.cloud)(isDay);
  return `<svg class="icon" viewBox="0 0 64 68" aria-hidden="true">${body}</svg>`;
}
