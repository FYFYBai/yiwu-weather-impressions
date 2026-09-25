import { ModelViewport } from './geometry.js';
import { getWeather, rangeFor, latestDate } from './weather.js';
import { t, setText, initializeLanguage } from './i18n.js';
import { createArtworkViewer } from './image-viewer.js';

const mapKind = ['transparency','reflectivity'].includes(document.body.dataset.map) ? document.body.dataset.map : 'color';
const legacy = mapKind === 'color';
const { makePlate, drawPlate, skyRatios } = await import({color:'./art-legacy.js',transparency:'./art-transparency.js',reflectivity:'./art-reflectivity.js'}[mapKind]);
const $ = id => document.getElementById(id);
initializeLanguage();
if (legacy) {
  Object.assign($('density'), { min:'90', max:'320', step:'10', value:'170' });
  $('density-value').value='170';
}
if (mapKind === 'reflectivity') {
  Object.assign($('density'), { min:'90', max:'360', step:'10', value:'260' });
  $('density-value').value='260';
}
let viewport, weather = null, plate = null, mode = 'surface', edition = 0, busy = false, loadingModel = false;
const imageViewer=createArtworkViewer({canvas:$('artwork'),title:{color:'Color Map',transparency:'Transparency Map',reflectivity:'Reflectivity Map'}[mapKind]});
let requested = rangeFor(365), weatherAbort, toastTimer, weatherSequence = 0, revision = 0;
const patternControls = legacy ? (await import('./pattern-controls.js')).createPatternControls({ onChange:dirty }) : null;
function toast(message) { setText('toast',message); $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 6500); }
function icons() { window.lucide?.createIcons(); }
function settings() { return { ...patternControls?.getSettings(), transparency: mapKind === 'transparency' ? { color:$('transparency-color').value, scale:+$('transparency-scale').value, variation:+$('transparency-variation').value } : undefined,
  reflectivity: mapKind === 'reflectivity' ? { color:$('reflectivity-color').value, pattern:$('reflectivity-pattern').value, scale:+$('reflectivity-scale').value, flow:+$('reflectivity-flow').value, glint:+$('reflectivity-glint').value, scatter:+$('reflectivity-scatter').value } : undefined,
  mode, density: +$('density').value, contrast: +$('contrast').value / 100, intensity: +$('intensity').value / 100,
  channels: Object.fromEntries([...document.querySelectorAll('[data-channel]')].map(input => [input.dataset.channel,input.checked])) }; }
function dirty() { revision++; if (plate && !busy) { $('run-state').textContent = 'CHANGED'; setText('print-tag',() => `YIWU / ${String(edition).padStart(3,'0')} · ${t('待重新生成')}`); } }
function mapLabels() {
  const labels={ 'transparency-settings':['Mark settings','点阵设置'], 'mark-color':['Mark color','点阵颜色'], 'mark-scale':['Dot size','点的大小'], 'mark-variation':['Tonal variation','层次变化'],
    'reflectivity-settings':['Reflection settings','反射纹样设置'], 'reflection-color':['Ink color','纹样颜色'], 'reflection-pattern':['Pattern','纹样'], 'reflection-shards':['Shards','碎片'], 'reflection-crosshatch':['Crosshatch','交错排线'], 'reflection-grain':['Grain','颗粒'], 'reflection-scale':['Mark size','纹样大小'], 'reflection-flow':['Directional flow','方向强度'], 'reflection-glint':['Glint contrast','高光对比'], 'reflection-scatter':['Scatter','散布程度'], 'reflection-density':['Mark density','纹样密度'], 'reflection-style':['Engraved marks','刻痕纹样'],
    rainy:['Rainy','雨天'],cloudy:['Cloudy (derived)','阴天（推算）'],sunny:['Sunny','晴天'] };
  document.querySelectorAll('[data-map-label]').forEach(el=>{el.textContent=labels[el.dataset.mapLabel][document.documentElement.lang.startsWith('zh')?1:0];});
}
mapLabels();document.addEventListener('studio-language-change',mapLabels);
function updateInfo(info) { $('geometry-info').textContent = `${info.meshes.toLocaleString()} meshes / ${info.triangles.toLocaleString()} faces`; }
function busyState(value) {
  busy = value; $('run').disabled = value || loadingModel; $('png').disabled = value || !plate; $('jpeg').disabled = value || !plate;
  $('working').hidden = !value;
  imageViewer.setAvailable(!value&&!!plate);
  if (viewport) viewport.controls.enabled = !value && !loadingModel;
}
async function run({ initial = false } = {}) {
  if (busy || loadingModel || !viewport) return;
  busyState(true); $('run-state').textContent = 'RUNNING';
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    const config = settings(), capture = viewport.capture(mode, +$('layers').value);
    const capturedRevision = revision;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    plate = makePlate(capture, config, weather, seed);
    drawPlate($('artwork'), plate);
    imageViewer.refresh();
    edition++;
    $('seed-label').textContent = `EDITION / ${String(edition).padStart(4,'0')}`;
    const printEdition = edition, hasWeather = !!weather;
    setText('print-tag',() => `YIWU / ${String(printEdition).padStart(3,'0')}${hasWeather ? '' : ' · '+t('无气象色彩')}`);
    $('run-state').textContent = 'READY';
    const markMode = {color:'WEAVE',transparency:'DOTS',reflectivity:'REFLECTION'}[mapKind];
    $('print-mode').textContent = mode === 'surface' ? `SURFACE / ${markMode}` : `DEPTH × ${$('layers').value} / ${markMode}`;
    $('print-info').textContent = `${$('artwork').width} × ${$('artwork').height} PX`;
    $('print-tag').title = plate.weatherRange || t('无气象数据');
    if (revision !== capturedRevision) $('run-state').textContent = 'CHANGED';
    if (!initial && !weather) toast('气象数据尚未就绪，已生成基础点阵。读取完成后再 Run 可添加纹样。');
    return { ok:true, edition, seed:plate.seed, dots:plate.dots.length };
  } catch (error) { toast(error.message); $('run-state').textContent = 'ERROR'; return {ok:false,error:error.message}; }
  finally { busyState(false); }
}

function drawWeather() {
  const canvas = $('weather-chart'), ctx = canvas.getContext('2d');
  canvas.width = Math.max(400, canvas.clientWidth * 2); canvas.height = 100;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if (!weather) return;
  const bins = Math.min(weather.days.length, Math.floor(canvas.width / 5)), values = Array(bins).fill(0);
  weather.days.forEach((day,i) => { const index = Math.min(bins-1,Math.floor(i/weather.days.length*bins)); values[index] = Math.max(values[index],day.precipitation); });
  const max = Math.max(10,...values);
  values.forEach((v,i) => { ctx.fillStyle = v > 30 ? '#71b9d2' : '#b7ddea'; ctx.fillRect(i/bins*canvas.width,88-v/max*75,Math.max(1,canvas.width/bins-2),Math.max(1,v/max*75)); });
  ctx.fillStyle = '#bec2b8'; for(let i=0;i<13;i++) ctx.fillRect(i/12*canvas.width,94,1,6);
}
function showWeather() {
  if (!legacy) {
    const ratios=skyRatios(weather);
    const percentages=ratios?[ratios.rainy,ratios.cloudy,ratios.sunny].map(v=>Math.floor(v*100)):null;
    if(ratios){const rank=['rainy','cloudy','sunny'].map((key,i)=>({i,f:ratios[key]*100-percentages[i]})).sort((a,b)=>b.f-a.f);const remainder=100-percentages.reduce((a,b)=>a+b,0);for(let i=0;i<remainder;i++)percentages[rank[i].i]++;}
    ['rainy','cloudy','sunny'].forEach((key,i)=>{$(key+'-ratio').textContent=ratios?`${percentages[i]}%`:'—';$(key+'-ratio').title=ratios?`${ratios.counts[key]} / ${ratios.total} days`:'';});
  }
  $('rain-stat').textContent = weather.total.toLocaleString('en-US',{maximumFractionDigits:0});
  $('wind-stat').textContent = weather.wind.toFixed(1);
  $('flood-stat').textContent = Math.round(weather.flood * 100);
  $('sun-stat').textContent = weather.sunnyDays;
  $('date-label').textContent = `${weather.availableStart} — ${weather.availableEnd} / ${weather.days.length} DAYS`;
  const w = weather;
  setText('weather-status',() => `${t(w.source === 'snapshot' ? '存档快照' : '真实历史数据')} · ${w.days.length} ${t('天')}${w.coverage < 1 ? ' · '+t('部分缺测') : ''}`);
  $('weather-status').parentElement.classList.remove('error');
  setText('data-description',() => `Open-Meteo / ${w.model} ${t(legacy ? '再分析 · 日照占比定义晴天 · 积水潜势为7日降雨推算' : '再分析 · 雨天≥1mm；其余日期日照≥60%为晴天，否则为阴天（推算）')}`);
  setText('data-age',() => w.source === 'snapshot' ? `${t('快照读取于')} ${w.fetchedAt?.slice(0,10) || '—'}` : t('历史窗口截至5天前'));
  drawWeather();
}
async function fetchWeather(refresh = false) {
  const seq = ++weatherSequence;
  weatherAbort?.abort(); weatherAbort = new AbortController();
  const controller = weatherAbort;
  weather = null;
  setText('weather-status','正在读取历史气象…');
  $('weather-status').parentElement.classList.remove('error');
  ['rain-stat','wind-stat','flood-stat','sun-stat'].forEach(id => $(id).textContent = '—');
  if(!legacy)['rainy','cloudy','sunny'].forEach(key=>{$(key+'-ratio').textContent='—';$(key+'-ratio').title='';});
  $('date-label').textContent = `${requested.start} — ${requested.end}`;
  dirty(); drawWeather();
  const timeout = setTimeout(() => controller.abort(new Error('读取超时，请重试。')),25000);
  try {
    const result = await getWeather(requested.start, requested.end, { signal: controller.signal, refresh });
    if (seq !== weatherSequence) return;
    weather = result; showWeather();
    if (edition <= 1 && !loadingModel && !busy) await run({initial:true}); else dirty();
  } catch (error) {
    if (seq !== weatherSequence) return;
    setText('weather-status',controller.signal.aborted ? '读取超时 · 点击重试' : '数据不可用 · 点击重试');
    $('weather-status').parentElement.classList.add('error');
    setText('data-description',error.message || '网络不可用，未使用模拟天气。');
    setText('data-age','当前无气象数据');
  } finally { clearTimeout(timeout); }
}

async function loadFile(file) {
  if (!file || busy || loadingModel) return false;
  loadingModel = true; $('upload').disabled = true; $('demo').disabled = true; busyState(false);
  setText('model-status','READING .3DM…');
  try {
    const info = await viewport.load(file);
    setText('model-name',() => file.name); updateInfo(info);
    const messages = info.warnings.map(w => typeof w === 'string' ? w : w.message || w.type || '').filter(Boolean);
    setText('model-status',messages.length ? '部分对象未显示 · 请检查网格' : 'RHINO / MESH READY');
    $('model-status').title = messages.join('\n');
    if (messages.length) toast('已导入，但部分曲面可能缺少渲染网格。请在 Rhino 着色视图保存，或先执行 Mesh。');
    dirty();
    return true;
  } catch (error) { setText('model-status','导入失败 · 保留原模型'); toast(error.message || '无法读取此 .3dm 文件。'); return false; }
  finally { loadingModel = false; $('upload').disabled = false; $('demo').disabled = false; $('file').value = ''; busyState(false); }
}

let bundledDefaultFile;
async function restoreDefaultModel() {
  if (busy || loadingModel) return false;
  loadingModel=true;$('upload').disabled=true;$('demo').disabled=true;busyState(false);
  setText('model-status','READING .3DM…');
  try {
    if(!bundledDefaultFile){
      const response=await fetch(new URL('./models/massing-model-v2.3dm',import.meta.url),{signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error('Default model download failed: '+response.status);
      bundledDefaultFile=new File([await response.arrayBuffer()],'Massing Model v2 (1).3dm');
    }
    loadingModel=false;return await loadFile(bundledDefaultFile);
  } catch(error){setText('model-status','导入失败 · 保留原模型');toast(error.message);return false;}
  finally{loadingModel=false;$('upload').disabled=false;$('demo').disabled=false;busyState(false);}
}

async function download(type) {
  if (!plate || busy) return;
  const exportPlate = plate;
  const canvas = document.createElement('canvas'); drawPlate(canvas,exportPlate,+$('resolution').value);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/' + type, .96));
  if (!blob) { toast('导出失败，请降低分辨率后重试。'); return; }
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `yiwu-${mapKind}-${exportPlate.mode}-${exportPlate.seed}.${type === 'jpeg' ? 'jpg' : 'png'}`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),60000);
  setText('toast',() => `${t('已生成下载文件')} / ${type.toUpperCase()} / ${canvas.width} × ${canvas.height} PX`);
  $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,5000);
  $('print-info').dataset.exportType=blob.type; $('print-info').dataset.exportBytes=String(blob.size);
  $('print-info').dataset.exportDimensions=`${canvas.width}x${canvas.height}`;
}

function registerTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const tools = [
    {name:'read_yiwu_studio',description:'Read current model, weather dates and generated plate status.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},
      execute:async () => ({model:$('model-name').textContent,mode,weather:weather?{start:weather.start,end:weather.end,source:weather.source}:null,edition,plate:plate?{seed:plate.seed,dots:plate.dots.length}:null})},
    {name:'generate_yiwu_plate',description:'Generate a new randomized dotted plate using the current model view and selected weather settings.',inputSchema:{type:'object',properties:{mode:{type:'string',enum:['surface','layers']}},additionalProperties:false},annotations:{readOnlyHint:false},
      execute:async input => { if (!input || Object.keys(input).some(k=>k!=='mode') || (input.mode !== undefined && !['surface','layers'].includes(input.mode))) throw new Error('Invalid mode'); if(busy || loadingModel) throw new Error('Studio busy'); if(input.mode) setMode(input.mode); const result = await run(); if(!result?.ok) throw new Error(result?.error || 'Generation unavailable'); return result; }}
  ];
  for(const tool of tools) { try { Promise.resolve(context.registerTool(tool)).catch(()=>{}); } catch {} }
}
function setMode(value) { mode = value; document.querySelectorAll('[data-mode]').forEach(b => { b.classList.toggle('active',b.dataset.mode===mode); b.setAttribute('aria-pressed',String(b.dataset.mode===mode)); }); $('layer-control').hidden = mode !== 'layers'; dirty(); }

try {
  viewport = new ModelViewport($('viewport'), angles => { $('angle-label').textContent = `AZ ${angles.azimuth.toFixed(0)}° / EL ${angles.elevation.toFixed(0)}°`; dirty(); }, { initialView:'iso', captureWidth:760 });
  updateInfo(viewport.info());
  $('upload').onclick = () => $('file').click();
  $('file').onchange = () => loadFile($('file').files[0]);
  $('demo').onclick = async () => { if(await restoreDefaultModel()) await run(); };
  $('model-stage').ondragover = e => { e.preventDefault(); };
  $('model-stage').ondrop = e => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); };
  $('front').onclick = () => viewport.fit('front'); $('iso').onclick = () => viewport.fit('iso'); $('fit').onclick = () => viewport.fit();
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  document.querySelectorAll('[data-period]').forEach(b => b.onclick = () => {
    document.querySelectorAll('[data-period]').forEach(other => { other.classList.toggle('active',other===b); other.setAttribute('aria-pressed',String(other===b)); });
    $('custom-dates').hidden = b.dataset.period !== 'custom';
    if (b.dataset.period !== 'custom') { requested = rangeFor(+b.dataset.period); $('start-date').value=requested.start; $('end-date').value=requested.end; fetchWeather(); }
  });
  ['density','contrast','intensity','layers'].forEach(id => $(id).oninput = () => { $(id+'-value').value = $(id).value + (['contrast','intensity'].includes(id)?'%':''); dirty(); });
  if(mapKind === 'transparency'){['transparency-scale','transparency-variation'].forEach(id=>$(id).oninput=()=>{$(id+'-value').value=$(id).value+'%';dirty();});$('transparency-color').oninput=dirty;}
  if(mapKind === 'reflectivity'){
    ['reflectivity-scale','reflectivity-flow','reflectivity-glint','reflectivity-scatter'].forEach(id=>$(id).oninput=()=>{$(id+'-value').value=$(id).value+'%';dirty();});
    $('reflectivity-color').oninput=dirty; $('reflectivity-pattern').onchange=dirty;
  }
  document.querySelectorAll('[data-channel]').forEach(input => input.onchange=dirty);
  $('start-date').value=requested.start; $('end-date').value=requested.end;
  $('start-date').max=latestDate(); $('end-date').max=latestDate();
  $('apply-dates').onclick = () => { requested={start:$('start-date').value,end:$('end-date').value}; fetchWeather(); };
  $('refresh-weather').onclick=()=>fetchWeather(true);
  $('run').onclick=()=>run(); $('png').onclick=()=>download('png'); $('jpeg').onclick=()=>download('jpeg');
  new ResizeObserver(drawWeather).observe($('weather-chart'));
  icons(); registerTools(); await restoreDefaultModel(); await run({initial:true}); fetchWeather();
} catch(error) { setText('model-status','无法初始化三维视图'); toast(t('需要支持 WebGL 的浏览器。') + error.message); $('run').disabled=true; }
