export const DEFAULT_BASE_COLOR = '#C3D1D1';

export const PATTERN_OPTIONS = Object.freeze({
  rain: Object.freeze(['stitch', 'continuous', 'zigzag']),
  wind: Object.freeze(['strokes', 'herringbone', 'crosshatch']),
  flood: Object.freeze(['connected', 'stepped', 'wave']),
  sun: Object.freeze(['squares', 'diamonds', 'dots'])
});

export const NUMERIC_FIELDS = Object.freeze({
  amount: Object.freeze({ min: 0, max: 100, step: 1 }),
  width: Object.freeze({ min: 0.1, max: 4, step: 0.05 }),
  length: Object.freeze({ min: 0, max: 100, step: 1 }),
  spacing: Object.freeze({ min: 0, max: 100, step: 1 }),
  angle: Object.freeze({ min: -90, max: 90, step: 1 }),
  variation: Object.freeze({ min: 0, max: 100, step: 1 }),
  opacity: Object.freeze({ min: 0, max: 100, step: 1 }),
  weave: Object.freeze({ min: 0, max: 100, step: 1 }),
  fade: Object.freeze({ min: 0, max: 100, step: 1 })
});

const defaults = (pattern, color, amount, width) => Object.freeze({
  pattern, color, amount, width, length: 80, spacing: 45, angle: 0,
  variation: 35, opacity: 100, weave: 65, fade: 80
});

export const DEFAULT_PATTERNS = Object.freeze({
  rain: defaults('stitch', '#619394', 65, 0.45),
  wind: defaults('strokes', '#D0E0B1', 55, 0.9),
  flood: defaults('connected', '#FDADA4', 45, 0.7),
  sun: defaults('squares', '#E8B86C', 65, 2.4)
});

export function normalizeColor(input, fallback = DEFAULT_BASE_COLOR) {
  return typeof input === 'string' && /^#[\da-f]{6}$/i.test(input) ? input.toUpperCase() : fallback;
}

export function normalizePatterns(input = {}) {
  const result = {};
  for (const [channel, fallback] of Object.entries(DEFAULT_PATTERNS)) {
    const candidate = input?.[channel] || {};
    const value = { ...fallback };
    value.pattern = PATTERN_OPTIONS[channel].includes(candidate.pattern) ? candidate.pattern : fallback.pattern;
    value.color = normalizeColor(candidate.color, fallback.color);
    for (const [field, range] of Object.entries(NUMERIC_FIELDS)) {
      const number = candidate[field];
      if (typeof number === 'number' && Number.isFinite(number)) {
        value[field] = Math.min(range.max, Math.max(range.min, number));
      }
    }
    result[channel] = value;
  }
  return result;
}
