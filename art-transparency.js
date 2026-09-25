import { seeded } from './art-legacy.js';

const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
export const DEFAULT_TRANSPARENCY_COLOR='#829B9B';

export function skyRatios(weather) {
  const counts={rainy:0,cloudy:0,sunny:0};
  for(const day of weather?.days || []) {
    if(!Number.isFinite(day.precipitation)||!Number.isFinite(day.sunshine))continue;
    counts[day.precipitation>=1?'rainy':day.sunshine>=.6?'sunny':'cloudy']++;
  }
  const total=counts.rainy+counts.cloudy+counts.sunny;
  return total?{rainy:counts.rainy/total,cloudy:counts.cloudy/total,sunny:counts.sunny/total,total,counts}:null;
}

function noise(x,y,seed) {
  const hash=(a,b)=>{let v=Math.imul(a,374761393)+Math.imul(b,668265263)+Math.imul(seed,1442695041);v=Math.imul(v^(v>>>13),1274126177);return ((v^(v>>>16))>>>0)/4294967295;};
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const smooth=t=>t*t*t*(t*(t*6-15)+10);
  const u=smooth(fx),v=smooth(fy);
  return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v)+(hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v;
}

function normalizeTones(samples,target,variation) {
  if(!samples.length)return;
  const mean=samples.reduce((sum,sample)=>sum+sample.texture,0)/samples.length;
  const variance=samples.reduce((sum,sample)=>sum+(sample.texture-mean)**2,0)/samples.length;
  const deviation=Math.max(.085,Math.sqrt(variance));
  const values=samples.map(sample=>(sample.texture-mean)/deviation*variation*2.2);
  const tone=(value,bias)=>.055+.89/(1+Math.exp(-value-bias));
  // Normalize overall exposure, not separate weather bands. The continuous
  // response has no class boundaries, even when a sky category is absent.
  let low=-12,high=12;
  for(let iteration=0;iteration<18;iteration++){
    const bias=(low+high)/2;
    const average=values.reduce((sum,value)=>sum+tone(value,bias),0)/values.length;
    if(average<target)low=bias;else high=bias;
  }
  const bias=(low+high)/2;
  samples.forEach((sample,i)=>{sample.tone=tone(values[i],bias);});
}

export function makePlate(capture,settings,weather,seed) {
  const {width,height}=capture,pixels=capture.surface||capture.frames[0];
  const config=settings.transparency||{};
  const color=/^#[\da-f]{6}$/i.test(config.color||'')?config.color:DEFAULT_TRANSPARENCY_COLOR;
  const size=clamp(Number.isFinite(config.scale)?config.scale:100,60,160)/100;
  const variation=clamp(Number.isFinite(config.variation)?config.variation:65,0,100)/100;
  const step=width/clamp(settings.density||280,60,600),ratios=skyRatios(weather);
  const random=seeded(seed),phaseX=random()*40,phaseY=random()*40;
  let minX=width,maxX=-1,minY=height,maxY=-1;
  const mask=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[((height-y-1)*width+x)*4+3]>=100){
    mask[y*width+x]=1;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  }
  if(maxX<minX)throw new Error('当前视角没有可见模型，请点击适配模型后重试。');
  const spanX=maxX-minX+1,spanY=maxY-minY+1,patch=Math.max(spanX*.34,spanY*.20,step*10);
  const samples=[];
  for(let yf=step/2;yf<height;yf+=step)for(let xf=step/2;xf<width;xf+=step){
    const x=Math.round(xf),y=Math.round(yf);
    if(x>=width||y>=height||!mask[y*width+x])continue;
    const p=((height-y-1)*width+x)*4;
    const nx=pixels[p]/127.5-1,ny=pixels[p+1]/127.5-1,nz=pixels[p+2]/127.5-1;
    const light=clamp(nx*-.48+ny*.61+nz*.63);
    const dx=xf-minX,dy=yf-minY;
    const u=(dx*.94+dy*.34)/patch+phaseX,v=(-dx*.34+dy*.94)/patch+phaseY;
    // Broad curves remain dominant, with a restrained second scale for local variation.
    const field=.78*noise(u,v,seed)+.14*noise(u*1.65,v*1.65,seed+17)+.08*noise(u*.5,v*.5,seed+33);
    // Independent, gently warped scales introduce light pockets in dark fields
    // and dark pockets in light fields without adding sharp noise or contours.
    const warpX=(noise(u*.7+9,v*.7,seed+51)-.5)*.65;
    const warpY=(noise(u*.7,v*.7-7,seed+73)-.5)*.65;
    const detail=noise(u*2.1+warpX,v*2.1+warpY,seed+107);
    const grain=noise(u*3.6+warpY,v*3.6-warpX,seed+149);
    const texture=.50*(.5-field)+.42*(detail-.5)+.08*(grain-.5);
    samples.push({x:xf,y:yf,light,field,texture,pixel:p});
  }
  // Keep category counts for provenance, but do not turn their thresholds into
  // visible bands: weather sets exposure and the mixed field supplies texture.
  const ranked=[...samples].sort((a,b)=>a.field-b.field);
  const rainEnd=ratios?Math.round(ratios.rainy*ranked.length):0;
  const cloudEnd=ratios?Math.round((ratios.rainy+ratios.cloudy)*ranked.length):0;
  const mean=ratios?ratios.rainy*.82+ratios.cloudy*.49+ratios.sunny*.18:.48;
  ranked.forEach((sample,i)=>{
    sample.sky=!ratios?'neutral':i<rainEnd?'rainy':i<cloudEnd?'cloudy':'sunny';
    sample.tone=mean;
  });
  if(ratios&&variation>0)normalizeTones(samples,mean,variation);
  const dots=[],ghosts=[];
  for(const sample of samples){
    const contrast=clamp(settings.contrast??.65),shade=clamp(.9+(.36-sample.light)*(.35+contrast*.7),.40,1.23);
    const tone=clamp(sample.tone*shade,.035,1);
    const radius=Math.min(step*.475,step*(.065+.39*Math.pow(tone,.83))*size);
    const alpha=clamp(.16+.84*Math.pow(tone,.72),.13,1);
    dots.push({x:sample.x,y:sample.y,radius,color,alpha,sky:sample.sky});
    if(settings.mode==='layers'&&capture.frames.length>1)capture.frames.forEach((frame,index)=>{
      if(frame[sample.pixel+3]<100)return;
      const offset=(index/(capture.frames.length-1)-.5)*step*.8;
      ghosts.push({x:sample.x+offset,y:sample.y-offset,radius:radius*.8,color,alpha:alpha*.10});
    });
  }
  const paperWidth=900,paperHeight=1320;
  const modelScale=Math.min(paperWidth*.76/spanX,paperHeight*.72/spanY);
  const paper={width:paperWidth,height:paperHeight,scale:modelScale,x:(paperWidth-spanX*modelScale)/2-minX*modelScale,y:paperHeight*.53-spanY*modelScale/2-minY*modelScale};
  const clipRuns=[];
  for(let y=minY;y<=maxY;y++){
    let start=-1;
    for(let x=minX;x<=maxX+1;x++){
      if(x<=maxX&&mask[y*width+x]){if(start<0)start=x;}
      else if(start>=0){clipRuns.push([start-.5,y-.5,x-start,1]);start=-1;}
    }
  }
  return {width,height,dots,ghosts,clipRuns,paper,ratios,seed,bounds:{minX,maxX,minY,maxY},mode:settings.mode,angles:capture.angles,weatherRange:weather?`${weather.start}/${weather.end}`:null,weatherSource:weather?.source||'none'};
}

export function drawPlate(canvas,plate,width=1500) {
  canvas.width=width;canvas.height=Math.round(width*plate.paper.height/plate.paper.width);
  const ctx=canvas.getContext('2d'),scale=width/plate.paper.width;
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(scale,0,0,scale,0,0);
  ctx.fillStyle='#dce3e3';ctx.globalAlpha=.42;
  ctx.beginPath();
  for(let y=10;y<plate.paper.height-10;y+=7)for(let x=10;x<plate.paper.width-10;x+=7){ctx.moveTo(x+.38,y);ctx.arc(x,y,.38,0,Math.PI*2);}
  ctx.fill();
  const layerCanvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(canvas.width,canvas.height):null;
  const ink=layerCanvas?layerCanvas.getContext('2d'):ctx;
  ink.setTransform(scale*plate.paper.scale,0,0,scale*plate.paper.scale,scale*plate.paper.x,scale*plate.paper.y);
  if(!layerCanvas){ink.save();ink.beginPath();for(const run of plate.clipRuns)ink.rect(...run);ink.clip();}
  // Composite the silhouette once, instead of re-rasterizing a complex clip
  // for every opacity group in a large PNG export.
  for(const layer of [plate.ghosts,plate.dots]){
    const batches=new Map();
    for(const dot of layer){const key=Math.round(dot.alpha*64);if(!batches.has(key))batches.set(key,[]);batches.get(key).push(dot);}
    for(const [alpha,dots] of batches){
      ink.fillStyle=dots[0].color;ink.globalAlpha=alpha/64;ink.beginPath();
      for(const dot of dots){ink.moveTo(dot.x+dot.radius,dot.y);ink.arc(dot.x,dot.y,dot.radius,0,Math.PI*2);}
      ink.fill();
    }
  }
  if(layerCanvas){
    ink.globalAlpha=1;ink.globalCompositeOperation='destination-in';ink.beginPath();for(const run of plate.clipRuns)ink.rect(...run);ink.fill();
    ctx.globalAlpha=1;ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(layerCanvas,0,0);
  }else ctx.restore();
  ctx.globalAlpha=1;ctx.setTransform(1,0,0,1,0,0);
}
