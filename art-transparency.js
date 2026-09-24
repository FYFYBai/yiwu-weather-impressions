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
  const u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
  return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v)+(hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v;
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
  const spanX=maxX-minX+1,spanY=maxY-minY+1,patch=Math.max(spanX*.22,spanY*.12,step*10);
  const samples=[];
  for(let yf=step/2;yf<height;yf+=step)for(let xf=step/2;xf<width;xf+=step){
    const x=Math.round(xf),y=Math.round(yf);
    if(x>=width||y>=height||!mask[y*width+x])continue;
    const p=((height-y-1)*width+x)*4;
    const nx=pixels[p]/127.5-1,ny=pixels[p+1]/127.5-1,nz=pixels[p+2]/127.5-1;
    const light=clamp(nx*-.48+ny*.61+nz*.63);
    const u=(xf-minX)/patch+phaseX,v=(yf-minY)/patch+phaseY;
    const field=.58*noise(u,v,seed)+.27*noise(u*2.1,v*2.1,seed+17)+.15*(.5+.5*Math.sin(v*2.9+noise(u*.5,v*.6,seed+33)*4));
    samples.push({x:xf,y:yf,light,field,pixel:p});
  }
  // Quantile allocation gives the three spatial fields the actual day ratios,
  // independent of the nonuniform distribution of the organic noise field.
  const ranked=[...samples].sort((a,b)=>a.field-b.field);
  const rainEnd=ratios?Math.round(ratios.rainy*ranked.length):0;
  const cloudEnd=ratios?Math.round((ratios.rainy+ratios.cloudy)*ranked.length):0;
  ranked.forEach((sample,i)=>{
    let tone,sky;
    if(!ratios){sky='neutral';tone=.48;}
    else if(i<rainEnd){sky='rainy';tone=.97-.29*i/Math.max(1,rainEnd);}
    else if(i<cloudEnd){sky='cloudy';tone=.67-.35*(i-rainEnd)/Math.max(1,cloudEnd-rainEnd);}
    else {sky='sunny';tone=.31-.24*(i-cloudEnd)/Math.max(1,ranked.length-cloudEnd);}
    const mean=ratios?ratios.rainy*.82+ratios.cloudy*.49+ratios.sunny*.18:.48;
    sample.tone=mean*(1-variation)+tone*variation;sample.sky=sky;
  });
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
