// Defaults, overridable with URL query params, e.g.
//   ?lat=50.06&lon=19.94&place=Kraków
import { STRINGS } from './strings.js';

const params = new URLSearchParams(location.search);

export const config = {
  lat: Number(params.get('lat') ?? 52.2297),
  lon: Number(params.get('lon') ?? 21.0122),
  place: params.get('place') ?? 'Warsaw',
  locale: params.get('locale') ?? 'en-GB',
};

export const t = STRINGS[config.locale.split('-')[0]] ?? STRINGS.en;

export const accounts = [
  { id: 'private', label: t.private, color: '#7cc4ff', url: params.get('cal-private') },
  { id: 'business', label: t.business, color: '#ffad5a', url: params.get('cal-business') },
].filter((a) => a.url);
