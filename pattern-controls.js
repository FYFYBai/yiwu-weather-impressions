import { DEFAULT_BASE_COLOR, DEFAULT_PATTERNS, PATTERN_OPTIONS, NUMERIC_FIELDS, normalizePatterns } from './pattern-settings.js';

const labels = {
  title: ['Marking system', '\u7eb9\u6837\u7cfb\u7edf'],
  base: ['Base dots', '\u57fa\u7840\u70b9\u9635'],
  element: ['Weather element', '\u6c14\u8c61\u5143\u7d20'],
  rain: ['Rain', '\u96e8'], wind: ['Wind', '\u98ce'],
  flood: ['Flood', '\u79ef\u6c34'], sun: ['Sun', '\u9633\u5149'],
  pattern: ['Pattern', '\u56fe\u6848'], color: ['Color', '\u989c\u8272'],
  amount: ['Amount', '\u6570\u91cf'], width: ['Stroke width', '\u7ebf\u6761\u7c97\u7ec6'],
  sunWidth: ['Mark size', '\u9897\u7c92\u5927\u5c0f'],
  length: ['Length', '\u957f\u5ea6'], rainLength: ['Length response', '\u957f\u5ea6\u54cd\u5e94'],
  sunLength: ['Size variation', '\u5c3a\u5bf8\u53d8\u5316'],
  spacing: ['Spacing', '\u95f4\u8ddd'], sunSpacing: ['Clearance', '\u9897\u7c92\u7559\u767d'],
  angle: ['Angle', '\u89d2\u5ea6'], variation: ['Irregularity', '\u4e0d\u89c4\u5219\u5ea6'],
  opacity: ['Opacity', '\u4e0d\u900f\u660e\u5ea6'], weave: ['Interweave', '\u4ea4\u7ec7\u5f3a\u5ea6'],
  fade: ['Gradient strength', '\u6e10\u53d8\u5f3a\u5ea6'],
  advanced: ['Fine adjustments', '\u7ec6\u8282\u8c03\u8282'],
  reset: ['Reset this element', '\u91cd\u7f6e\u5f53\u524d\u5143\u7d20'],
  stitch: ['Broken stitch', '\u65ad\u7eed\u7ec6\u9488'], continuous: ['Continuous', '\u8fde\u7eed\u7ebf'],
  zigzag: ['Zigzag', '\u6298\u7ebf'], strokes: ['Short strokes', '\u77ed\u7ebf'],
  herringbone: ['Herringbone', '\u4eba\u5b57\u7eb9'], blocks: ['Color blocks', '\u8272\u5757'],
  crosshatch: ['Color blocks', '\u8272\u5757'],
  blockAmount: ['Amount', '\u6570\u91cf'], blockWidth: ['Block thickness', '\u8272\u5757\u539a\u5ea6'],
  blockSpacing: ['Placement inset', '\u4f4d\u7f6e\u5185\u7f29'],
  connected: ['Linked dots', '\u8fde\u70b9\u7ebf'], stepped: ['Stepped', '\u9636\u68af\u7eb9'],
  wave: ['Wave', '\u6ce2\u7eb9'], squares: ['Squares', '\u65b9\u5757'],
  diamonds: ['Diamonds', '\u83f1\u5f62'], dots: ['Dots', '\u5706\u70b9']
};
export const patternLabel = (key, language='en') => (labels[key] || labels.pattern)[language.startsWith('zh') ? 1 : 0];
const translated = key => patternLabel(key, document.documentElement.lang);
const fieldLabel = (channel, field, pattern) => {
  if (pattern === 'blocks' && field === 'amount') return 'blockAmount';
  if (pattern === 'blocks' && field === 'width') return 'blockWidth';
  if (pattern === 'blocks' && field === 'spacing') return 'blockSpacing';
  if (channel === 'sun' && field === 'width') return 'sunWidth';
  if (channel === 'sun' && field === 'length') return 'sunLength';
  if (channel === 'sun' && field === 'spacing') return 'sunSpacing';
  if (channel === 'rain' && field === 'length') return 'rainLength';
  return field;
};
const formatValue = (field, value) => field === 'width' ? Number(value).toFixed(2) : `${value}${field === 'angle' ? '\u00b0' : '%'}`;

export function createPatternControls({ onChange = () => {} } = {}) {
  const host = document.getElementById('pattern-controls');
  if (!host) throw new Error('Pattern controls host is missing.');
  let patterns = normalizePatterns();
  let baseColor = DEFAULT_BASE_COLOR;
  let active = 'rain';
  let expanded = false;

  function syncColors() {
    for (const channel of Object.keys(patterns)) {
      document.documentElement.style.setProperty(`--${channel}`, patterns[channel].color);
      const swatch = host.querySelector(`[data-pattern-tab="${channel}"] .pattern-tab-swatch`);
      if (swatch) swatch.style.backgroundColor = patterns[channel].color;
    }
  }

  function render() {
    const config = patterns[active];
    const slider = field => {
      const range = NUMERIC_FIELDS[field];
      const id = `pattern-${active}-${field}`;
      return `<div class="pattern-range"><label for="${id}">${translated(fieldLabel(active, field, config.pattern))}<output for="${id}" id="${id}-value">${formatValue(field, config[field])}</output></label><input id="${id}" data-pattern-field="${field}" type="range" min="${range.min}" max="${range.max}" step="${range.step}" value="${config[field]}"></div>`;
    };
    host.innerHTML = `
      <h2><span class="mono">04</span> ${translated('title')}</h2>
      <div class="pattern-base-row"><label for="pattern-base-color">${translated('base')}</label><div class="pattern-color-value"><output id="pattern-base-value" for="pattern-base-color">${baseColor}</output><input id="pattern-base-color" type="color" value="${baseColor}"></div></div>
      <div class="pattern-tabs" role="tablist" aria-label="${translated('element')}">
        ${Object.keys(patterns).map(channel => `<button id="pattern-tab-${channel}" type="button" role="tab" data-pattern-tab="${channel}" aria-controls="pattern-panel" aria-selected="${channel === active}" tabindex="${channel === active ? 0 : -1}"><span class="pattern-tab-swatch" aria-hidden="true"></span><span>${translated(channel)}</span></button>`).join('')}
      </div>
      <div id="pattern-panel" role="tabpanel" aria-labelledby="pattern-tab-${active}">
        <div class="pattern-select-row"><label for="pattern-kind">${translated('pattern')}</label><select id="pattern-kind">${PATTERN_OPTIONS[active].map(pattern => `<option value="${pattern}"${pattern === config.pattern ? ' selected' : ''}>${translated(pattern)}</option>`).join('')}</select></div>
        <div class="pattern-color-row"><label for="pattern-color">${translated('color')}</label><div class="pattern-color-value"><output id="pattern-color-value" for="pattern-color">${config.color}</output><input id="pattern-color" type="color" value="${config.color}"></div></div>
        ${['amount', 'width', 'length'].map(slider).join('')}
        <details class="pattern-advanced"${expanded ? ' open' : ''}><summary>${translated('advanced')}</summary><div>${['spacing', 'angle', 'variation', 'opacity', 'weave', 'fade'].map(slider).join('')}</div></details>
        <div class="pattern-actions"><button id="pattern-reset" class="icon" type="button" title="${translated('reset')}" aria-label="${translated('reset')}"><i data-lucide="rotate-ccw"></i></button></div>
      </div>`;
    syncColors();
    globalThis.lucide?.createIcons({ attrs: { 'aria-hidden': 'true' } });

    host.querySelectorAll('[data-pattern-tab]').forEach(button => {
      const select = channel => {
        active = channel;
        render();
        host.querySelector(`[data-pattern-tab="${channel}"]`).focus();
      };
      button.addEventListener('click', () => select(button.dataset.patternTab));
      button.addEventListener('keydown', event => {
        const channels = Object.keys(patterns);
        let index = channels.indexOf(active);
        if (event.key === 'ArrowRight') index = (index + 1) % channels.length;
        else if (event.key === 'ArrowLeft') index = (index + channels.length - 1) % channels.length;
        else if (event.key === 'Home') index = 0;
        else if (event.key === 'End') index = channels.length - 1;
        else return;
        event.preventDefault();
        select(channels[index]);
      });
    });
    host.querySelector('#pattern-base-color').addEventListener('input', event => {
      baseColor = event.target.value.toUpperCase();
      host.querySelector('#pattern-base-value').value = baseColor;
      onChange();
    });
    host.querySelector('#pattern-color').addEventListener('input', event => {
      patterns[active].color = event.target.value.toUpperCase();
      host.querySelector('#pattern-color-value').value = patterns[active].color;
      syncColors();
      onChange();
    });
    host.querySelector('#pattern-kind').addEventListener('change', event => {
      patterns[active].pattern = event.target.value;
      render();
      host.querySelector('#pattern-kind').focus();
      onChange();
    });
    host.querySelectorAll('[data-pattern-field]').forEach(input => input.addEventListener('input', () => {
      const field = input.dataset.patternField;
      patterns[active][field] = Number(input.value);
      host.querySelector(`#${input.id}-value`).value = formatValue(field, Number(input.value));
      onChange();
    }));
    host.querySelector('details').addEventListener('toggle', event => { expanded = event.currentTarget.open; });
    host.querySelector('#pattern-reset').addEventListener('click', () => {
      patterns[active] = { ...DEFAULT_PATTERNS[active] };
      render();
      host.querySelector('#pattern-reset').focus();
      onChange();
    });
  }

  render();
  document.addEventListener('studio-language-change', render);
  return { getSettings: () => ({ patterns: normalizePatterns(patterns), baseColor }) };
}
