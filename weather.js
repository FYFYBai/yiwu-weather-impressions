export const LOCATION = { latitude: 29.31, longitude: 120.07, timezone: 'Asia/Shanghai' };
const dayMs = 86400000;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const shiftDate = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * dayMs).toISOString().slice(0, 10);
export function latestDate(now = new Date()) {
  const china = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit' }).format(now);
  return shiftDate(china, -5);
}
export function rangeFor(days, now) { const end = latestDate(now); return { start: shiftDate(end, -(days - 1)), end }; }
export function validateRange(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new Error('请选择完整的开始和结束日期。');
  for (const date of [start,end]) { const parsed = new Date(date + 'T00:00:00Z'); if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0,10) !== date) throw new Error('日期无效，请检查年月日。'); }
  if (start < '1940-01-07' || end > latestDate() || start > end) throw new Error('日期须在 1940-01-07 至最新可用日之间，且开始日不晚于结束日。');
  if ((Date.parse(end) - Date.parse(start)) / dayMs > 3653) throw new Error('单次最多读取 10 年，请缩短时间范围。');
}

export function summarize(data, start, end) {
  const d = data.daily;
  if (!d?.time?.length) throw new Error('气象接口没有返回日数据。');
  const days = [];
  for (let i = 0; i < d.time.length; i++) {
    if (d.time[i] < start || d.time[i] > end) continue;
    const precipitation = d.precipitation_sum?.[i], wind = d.wind_speed_10m_max?.[i];
    const direction = d.wind_direction_10m_dominant?.[i], sun = d.sunshine_duration?.[i], daylight = d.daylight_duration?.[i];
    if (![precipitation, wind, direction, sun, daylight].every(Number.isFinite) || daylight <= 0) continue;
    const window = d.precipitation_sum.slice(Math.max(0, i - 6), i + 1);
    const rolling = window.length === 7 && window.every(Number.isFinite) ? window.reduce((a, b) => a + b, 0) : null;
    days.push({ date: d.time[i], precipitation: Math.max(0, precipitation), wind: Math.max(0, wind), direction,
      sunshine: clamp(sun / daylight), rolling, flood: rolling === null ? null : clamp((rolling - 30) / 100) });
  }
  if (!days.length) throw new Error('该日期范围没有完整数据，请更换时间范围。');
  const mean = key => days.reduce((s, d) => s + d[key], 0) / days.length;
  const floods = days.filter(d => d.flood !== null);
  const flood = floods.length ? floods.reduce((s, d) => s + d.flood, 0) / floods.length : 0;
  const east = days.reduce((s, d) => s - Math.sin(d.direction * Math.PI / 180) * d.wind, 0) / days.length;
  const north = days.reduce((s, d) => s - Math.cos(d.direction * Math.PI / 180) * d.wind, 0) / days.length;
  const total = days.reduce((s, d) => s + d.precipitation, 0);
  const expected = Math.round((Date.parse(end) - Date.parse(start)) / dayMs) + 1;
  return { days, start, end, availableStart: days[0].date, availableEnd: days.at(-1).date, total, wind: mean('wind'),
    sunnyDays: days.filter(d => d.sunshine >= .6).length, flood, east, north, coverage: days.length / expected,
    rainStrength: days.reduce((s, d) => s + clamp(Math.log1p(d.precipitation / 10) / Math.log(7)), 0) / days.length,
    sunStrength: mean('sunshine'), windStrength: clamp(mean('wind') / 35), model: data._model || 'ERA5', source: 'live' };
}

const cache = new Map();
export async function getWeather(start, end, { signal, refresh = false } = {}) {
  validateRange(start, end);
  const key = start + '/' + end;
  if (!refresh && cache.has(key)) return cache.get(key);
  const model = start >= '2017-01-07' ? 'ecmwf_ifs' : 'era5';
  const params = new URLSearchParams({ ...LOCATION, start_date: shiftDate(start, -6), end_date: end,
    daily: 'precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant,sunshine_duration,daylight_duration',
    wind_speed_unit: 'kmh', models: model });
  let result;
  try {
    const deadline = AbortSignal.timeout(18000);
    const response = await fetch('https://archive-api.open-meteo.com/v1/archive?' + params, { signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
    if (!response.ok) throw new Error('气象接口暂时不可用 (' + response.status + ')');
    const json = await response.json();
    result = summarize({ ...json, _model: model === 'ecmwf_ifs' ? 'ECMWF IFS' : 'ERA5' }, start, end);
  } catch (error) {
    if (signal?.aborted) throw error;
    // A dated, real archive snapshot is a transparent fallback, never synthetic weather.
    try {
      const response = await fetch('./data/yiwu-archive.json', { signal });
      if (!response.ok) throw error;
      const json = await response.json();
      if (start < json.daily.time[6] || end > json.daily.time.at(-1)) throw error;
      result = summarize(json, start, end); result.source = 'snapshot'; result.fetchedAt = json._fetchedAt;
    } catch { throw error; }
  }
  cache.set(key, result); return result;
}
