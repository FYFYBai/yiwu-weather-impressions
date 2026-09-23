const english = {
  '气象印迹':'Weather Impressions','生成设置':'Studio settings','模型':'Model','导入 .3dm':'Import .3dm',
  '双塔 / 内置示例':'Twin towers / Demo','恢复内置示例':'Restore demo model','视图':'Projection',
  '投影方式':'Projection mode','可见表面':'Surface','多层叠印':'Overprint','生成风格':'Style','点阵 / Dots':'Dots',
  '点阵密度':'Dot density','明暗对比':'Tonal contrast','叠印层数':'Depth layers','气象':'Weather','义乌 · 浙江':'Yiwu, Zhejiang',
  '气象时间范围':'Weather period','90天':'90 days','1年':'1 year','3年':'3 years','自定':'Custom','开始':'From','结束':'To',
  '应用日期':'Apply dates','正在读取历史气象…':'Reading weather archive…','重新读取气象数据':'Reload weather',
  '降雨':'Rain','风':'Wind','积水潜势':'Waterlogging','推算':'Proxy','晴天':'Sunshine','色彩强度':'Color intensity',
  '积水潜势为降雨衍生指标，非洪水实测。':'Rainfall-derived proxy, not observed flooding.',
  '模型视角':'Model view','正视图':'Front view','轴测视图':'Axonometric view','适配模型':'Fit model',
  '三维模型，可拖动旋转':'3D model, drag to orbit','内置建筑模型':'Built-in architectural model',
  '气象点阵生成图':'Generated weather dot print','导出分辨率':'Export width','下载 PNG':'Download PNG','下载 JPEG':'Download JPEG',
  '历史气象概览':'Weather archive summary','气象档案':'Weather archive','累计降雨':'Total precipitation',
  '日最大风速均值':'Mean daily maximum wind','积水潜势 · 推算':'Waterlogging proxy','晴天 · 日照占比≥60%':'Sunny days · sunshine ≥60%',
  '天':'days','每日降雨时间序列':'Daily precipitation timeline','历史气象再分析数据':'Historical weather reanalysis',
  '请选择 Rhino .3dm 文件。':'Choose a Rhino .3dm file.',
  '文件没有可显示的网格。请在 Rhino 中以着色视图保存并保留渲染网格，或先执行 Mesh。':'No displayable meshes. Save the file in Rhino Shaded view with render meshes, or run Mesh first.',
  '模型边界为空或尺寸无效。':'The model has empty bounds or invalid dimensions.',
  '文件没有可见的网格。请在 Rhino 中显示所需图层并保存。':'No visible meshes. Show the required Rhino layers and save the file.',
  '模型没有可显示的网格。请在 Rhino 中开启至少一个网格图层。':'No visible meshes. Enable at least one mesh layer in Rhino.',
  '请选择完整的开始和结束日期。':'Choose both start and end dates.',
  '日期无效，请检查年月日。':'Invalid calendar date. Check the year, month and day.',
  '日期须在 1940-01-07 至最新可用日之间，且开始日不晚于结束日。':'Choose dates between 1940-01-07 and the latest available day, with the start before the end.',
  '单次最多读取 10 年，请缩短时间范围。':'Choose a period of 10 years or less.',
  '气象接口没有返回日数据。':'No daily data was returned by the weather service.',
  '该日期范围没有完整数据，请更换时间范围。':'No complete weather records for these dates. Choose another period.',
  '当前视角没有可见模型，请点击适配模型后重试。':'No model is visible. Fit the model and try again.',
  '待重新生成':'Changes pending','无气象色彩':'No weather color',
  '气象数据尚未就绪，已生成黑白点阵。读取完成后再 Run 可上色。':'Weather is not ready. A monochrome print was generated; run again after the data loads.',
  '存档快照':'Archive snapshot','真实历史数据':'Historical data','部分缺测':'Partial coverage',
  '读取超时 · 点击重试':'Timed out · retry','数据不可用 · 点击重试':'Data unavailable · retry',
  '网络不可用，未使用模拟天气。':'Network unavailable. No simulated weather is used.',
  '当前无气象数据':'No weather data loaded','历史窗口截至5天前':'Archive window ends 5 days ago',
  '部分对象未显示 · 请检查网格':'Some objects missing · check meshes',
  '已导入，但部分曲面可能缺少渲染网格。请在 Rhino 着色视图保存，或先执行 Mesh。':'Imported with warnings: some surfaces may lack render meshes. Save in Rhino Shaded view or run Mesh first.',
  '导入失败 · 保留原模型':'Import failed · previous model retained','无法读取此 .3dm 文件。':'Unable to read this .3dm file.',
  '导出失败，请降低分辨率后重试。':'Export failed. Try a lower resolution.',
  '无法初始化三维视图':'Unable to initialize the 3D view','需要支持 WebGL 的浏览器。':'A WebGL-capable browser is required. ',
  '读取超时，请重试。':'Request timed out. Please retry.','无气象数据':'No weather data',
  '再分析 · 日照占比定义晴天 · 积水潜势为7日降雨推算':'reanalysis · Sunny days use sunshine fraction · Waterlogging is a 7-day rain proxy',
  '快照读取于':'Snapshot retrieved','语言':'Language','图片背景':'Print background','已生成下载文件':'Export file ready'
};
let language = 'en';
const nodes = [], attributes = [], bindings = new Map();
export const t = key => language === 'en' ? english[key] || key : key;
export function setText(id, formatter) {
  bindings.set(id,formatter);
  const element = document.getElementById(id);
  if (element) element.textContent = typeof formatter === 'function' ? formatter() : t(formatter);
}
export function initializeLanguage() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const key = node.textContent.trim();
    if (english[key]) nodes.push({node,key,before:node.textContent.match(/^\s*/)[0],after:node.textContent.match(/\s*$/)[0]});
  }
  document.querySelectorAll('[title],[aria-label]').forEach(element => {
    for (const name of ['title','aria-label']) { const key = element.getAttribute(name); if(english[key]) attributes.push({element,name,key}); }
  });
  document.getElementById('language').addEventListener('change',e=>applyLanguage(e.target.value));
  applyLanguage('en');
}
function applyLanguage(next) {
  language = next === 'zh' ? 'zh' : 'en'; document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  for (const {node,key,before,after} of nodes) if(node.isConnected) node.textContent = before+t(key)+after;
  for (const {element,name,key} of attributes) element.setAttribute(name,t(key));
  for (const [id,formatter] of bindings) setText(id,formatter);
  document.dispatchEvent(new Event('studio-language-change'));
}
