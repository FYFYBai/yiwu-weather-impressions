const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
export const PALETTE = { rain: [113,208,241], wind: [189,218,120], flood: [128,80,168], sun: [251,243,152] };
const DITHER = [0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21];
export function seeded(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function makePlate(capture, settings, weather, seed) {
  const { width, height, frames } = capture;
  const random = seeded(seed);
  const step = width / settings.density;
  const dots = [], columnTop = new Float32Array(width).fill(height), columnBottom = new Float32Array(width).fill(-1);
  const rowLeft = new Float32Array(height).fill(width), rowRight = new Float32Array(height).fill(-1);
  const surfaceMask = new Uint8Array(width * height);
  // Silhouette bounds anchor weather marks to the model, not the rectangular page.
  for (const pixels of frames) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (pixels[((height - y - 1) * width + x) * 4 + 3] < 100) continue;
      surfaceMask[y * width + x] = 1;
      columnTop[x] = Math.min(columnTop[x], y); columnBottom[x] = Math.max(columnBottom[x], y);
      rowLeft[y] = Math.min(rowLeft[y], x); rowRight[y] = Math.max(rowRight[y], x);
    }
  }
  const validX = Array.from({length:width}, (_, x) => x).filter(x => columnBottom[x] > columnTop[x]);
  const validY = Array.from({length:height}, (_, y) => y).filter(y => rowRight[y] > rowLeft[y]);
  if (!validX.length || !validY.length) throw new Error('当前视角没有可见模型，请点击适配模型后重试。');
  const minX = validX[0], maxX = validX.at(-1), minY = validY[0], maxY = validY.at(-1);
  const spanX = maxX - minX, spanY = maxY - minY;
  const bands = [];
  if (weather) {
    const rainy = weather.days.filter(d => d.precipitation > .1);
    const flooded = weather.days.filter(d => d.flood > .01);
    const windy = weather.days.filter(d => d.wind > .5);
    const sunny = weather.days.filter(d => d.sunshine >= .6);
    for (const channel of ['rain','flood','wind','sun']) {
      if (!settings.channels[channel]) continue;
      const pool = { rain: rainy, flood: flooded, wind: windy, sun: sunny }[channel];
      const strength = { rain: weather.rainStrength, flood: weather.flood, wind: weather.windStrength, sun: weather.sunnyDays/weather.days.length }[channel];
      if (!pool.length || strength <= 0) continue;
      const count = Math.max(1, Math.round(({rain:18,flood:15,wind:14,sun:23*2.5}[channel]) * Math.sqrt(strength)));
      for (let i = 0; i < count; i++) {
        if (channel === 'sun') {
          const thickness = Math.max(step * 1.5, spanX * .008) * (1 + random() * .55);
          // Rejection sampling leaves a clear gap between small, surface-supported sprinkles.
          for (let attempt = 0; attempt < 80; attempt++) {
            const center = validX[Math.floor(random() * validX.length)];
            const sunY = minY + spanY * (.035 + .83 * Math.pow(random(), 1.3));
            const x0 = Math.floor(center-thickness/2), x1 = Math.ceil(center+thickness/2);
            const y0 = Math.floor(sunY-thickness/2), y1 = Math.ceil(sunY+thickness/2);
            if (x0 < 0 || x1 >= width || y0 < 0 || y1 >= height) continue;
            let supported = true;
            for (let y = y0; y <= y1 && supported; y++) for (let x = x0; x <= x1; x++) {
              if (!surfaceMask[y * width + x]) { supported = false; break; }
            }
            if (!supported) continue;
            const separated = bands.filter(b => b.channel === 'sun').every(b => {
              const clearance = (thickness + b.thickness) / 2 + step * 2.5;
              return Math.abs(center-b.center) > clearance || Math.abs(sunY-b.sunY) > clearance;
            });
            if (!separated) continue;
            bands.push({channel, center, sunY, thickness, tone:.96+random()*.08});
            break;
          }
          continue;
        }
        const d = pool[Math.floor(random() * pool.length)];
        const vertical = channel !== 'wind';
        const center = vertical ? validX[Math.floor(random() * validX.length)] : validY[Math.floor(random() * validY.length)];
        const individual = { rain: clamp(d.precipitation / 45), flood: d.flood || 0, wind: clamp(d.wind / 45), sun: d.sunshine }[channel];
        let length = ({rain:.82,flood:.66,wind:.95,sun:.24}[channel]) * (.3 + .7 * individual) * (.65 + .35 * random());
        // Meteorological direction is FROM; project the east/north flow onto camera right.
        const theta = d.direction * Math.PI / 180, az = capture.angles.azimuth * Math.PI / 180;
        const flow = -Math.sin(theta) * Math.cos(az) - Math.cos(theta) * Math.sin(az);
        if (channel === 'wind') { length *= Math.abs(flow); if (length < .015) continue; }
        bands.push({ channel, center, thickness: (vertical ? spanX : spanY) * (channel === 'sun' ? .026 + random() * .047 : .030 + random() * .095),
          length, flow, drift: channel === 'wind' ? (random() - .5) * .10 : 0,
          sunY: columnTop[center] + Math.pow(random(),1.7) * spanY * .42,
          offset: 0, tone: .92 + random() * .14 });
      }
    }
  }
  const colorAt = (x, y, gray) => {
    let color = [gray,gray,gray];
    for (const band of bands) {
      if (band.channel === 'sun') {
        if (Math.abs(x-band.center) <= band.thickness/2 && Math.abs(y-band.sunY) <= band.thickness/2) {
          const amount = Math.min(1,settings.intensity * 1.12);
          color = color.map((c,k)=>Math.round(c*(1-amount)+clamp(PALETTE.sun[k]*band.tone,0,255)*amount));
        }
        continue;
      }
      let progress, across;
      if (band.channel === 'wind') {
        const length = rowRight[y] - rowLeft[y]; if (length <= 0) continue;
        progress = band.flow < 0 ? (rowRight[y] - x) / length : (x - rowLeft[y]) / length;
        across = Math.abs(y - band.center - band.drift * (x - minX));
      } else {
        const length = columnBottom[x] - columnTop[x]; if (length <= 0) continue;
        progress = band.channel === 'flood' ? (columnBottom[x] - y) / length : (y - columnTop[x]) / length - band.offset;
        across = Math.abs(x - band.center);
      }
      if (across > band.thickness / 2 || progress < 0 || progress > band.length) continue;
      const fade = Math.pow(1 - progress / band.length, .35);
      const amount = fade * settings.intensity;
      color = color.map((c, k) => Math.round(c * (1 - amount) + clamp(PALETTE[band.channel][k] * band.tone, 0, 255) * amount));
    }
    return `rgb(${color.join(',')})`;
  };
  for (let layer = frames.length - 1; layer >= 0; layer--) {
    const pixels = frames[layer];
    const phase = frames.length > 1 ? (layer / frames.length - .5) * step * .75 : 0;
    for (let yf = step / 2; yf < height; yf += step) for (let xf = step / 2; xf < width; xf += step) {
      const x = Math.round(xf), y = Math.round(yf); if (x >= width || y >= height) continue;
      const p = ((height - y - 1) * width + x) * 4;
      if (pixels[p + 3] < 100) continue;
      const nx = pixels[p] / 127.5 - 1, ny = pixels[p+1] / 127.5 - 1, nz = pixels[p+2] / 127.5 - 1;
      const light = clamp(nx * -.48 + ny * .61 + nz * .63);
      const ink = clamp(.61 + (.46 - light) * (1.0 + settings.contrast * .95), .13, 1);
      const gx = Math.floor(xf/step), gy = Math.floor(yf/step);
      // Fixed-size dots, variable occupancy: planes read through density rather than gray tint.
      const threshold = (DITHER[((gy + layer * 3) % 8) * 8 + (gx + layer * 5) % 8] + .5) / 64;
      const sunshine = settings.intensity > 0 && bands.some(b => b.channel === 'sun' && Math.abs(x-b.center) <= b.thickness/2 && Math.abs(y-b.sunY) <= b.thickness/2);
      if (threshold > ink && !sunshine) continue;
      const size = step * (frames.length > 1 ? .35 : .40);
      const gray = 30;
      dots.push({ x: xf + phase, y: yf + phase, radius: size, color: colorAt(x,y,gray), alpha: frames.length > 1 ? .58 + .30 * (1-layer/frames.length) : 1 });
    }
  }
  return { width, height, dots, seed, sunshine: bands.filter(b => b.channel === 'sun'), bounds: {minX,maxX,minY,maxY}, weatherRange: weather ? `${weather.start}/${weather.end}` : null,
    weatherSource: weather?.source || 'none', mode: settings.mode, angles: capture.angles };
}

export function drawPlate(canvas, plate, width = 1500) {
  canvas.width = width; canvas.height = Math.round(width * plate.height / plate.width);
  const ctx = canvas.getContext('2d'), scale = width / plate.width, margin = .105;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
  // A pale halftone ground and generous paper border keep the print distinct from the viewport.
  ctx.setTransform(scale,0,0,scale,0,0);
  const spacing = 5.5;
  for(let y=spacing;y<plate.height-spacing;y+=spacing)for(let x=spacing;x<plate.width-spacing;x+=spacing){
    const tone=Math.round(244-10*Math.pow(y/plate.height,2));
    ctx.fillStyle=`rgb(${tone},${tone},${tone})`;ctx.beginPath();ctx.arc(x,y,.53,0,Math.PI*2);ctx.fill();
  }
  const modelScale = scale * (1-2*margin);
  ctx.setTransform(modelScale,0,0,modelScale,canvas.width*margin,canvas.height*margin);
  for (const dot of plate.dots) {
    ctx.globalAlpha = dot.alpha; ctx.fillStyle = dot.color;
    ctx.beginPath(); ctx.arc(dot.x,dot.y,dot.radius,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.setTransform(1,0,0,1,0,0);
}
