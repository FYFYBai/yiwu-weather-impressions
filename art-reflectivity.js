import { makePlate as makeSurfacePlate, skyRatios } from './art-transparency.js';
import { seeded } from './art-legacy.js';

export { skyRatios };
export const DEFAULT_REFLECTIVITY_COLOR='#455959';
const clamp=(n,low=0,high=1)=>Math.max(low,Math.min(high,n));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const control=(value,fallback,low=0,high=100)=>clamp(Number.isFinite(value)?value:fallback,low,high)/100;

function noise(x,y,seed){
  const hash=(a,b)=>{let n=Math.imul(a,374761393)+Math.imul(b,668265263)+Math.imul(seed,1442695041);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
  const ix=Math.floor(x),iy=Math.floor(y),u=smooth(x-ix),v=smooth(y-iy);
  return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v)+(hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v;
}

export function makePlate(capture,settings,weather,seed){
  const config=settings.reflectivity||{};
  const color=/^#[\da-f]{6}$/i.test(config.color||'')?config.color:DEFAULT_REFLECTIVITY_COLOR;
  const scale=control(config.scale,100,60,160),flow=control(config.flow,65);
  const glint=control(config.glint,65),scatter=control(config.scatter,35);
  const pattern=['shards','crosshatch','grain'].includes(config.pattern)?config.pattern:'shards';
  const density=clamp(Number.isFinite(settings.density)?settings.density:200,60,600),step=capture.width/density;
  // Reuse the established surface sampling, paper framing and silhouette mask.
  // Reflectivity is an artistic weather mapping, not a physical material estimate.
  const plate=makeSurfacePlate(capture,{...settings,density,mode:'surface',transparency:{color,scale:100,variation:0}},weather,seed);
  const {minX,maxX,minY,maxY}=plate.bounds,spanX=maxX-minX+1,spanY=maxY-minY+1;
  const pixels=capture.surface||capture.frames[0],random=seeded(seed),phase=random()*40;
  const ratios=plate.ratios,rain=ratios?.rainy||0,sun=ratios?.sunny||0,cloud=ratios?.cloudy||0;
  const patch=Math.max(spanX*.22,spanY*.12,step*8);
  const wind=Number.isFinite(weather?.east)&&Number.isFinite(weather?.north)?Math.atan2(weather.east,weather.north):0;
  const centers=Array.from({length:plate.dots.length?11+Math.round(sun*9):0},()=>{
    const anchor=plate.dots[Math.floor(random()*plate.dots.length)];
    return {x:anchor.x,y:anchor.y,rx:patch*(.20+random()*.42),ry:patch*(.28+random()*.56),strength:.75+random()*.25};
  });
  const contrast=control(settings.contrast===undefined?65:settings.contrast*100,65);
  const marks=[],dots=[],ghosts=[];
  for(const sample of plate.dots){
    const {x,y,sky}=sample,p=((capture.height-Math.round(y)-1)*capture.width+Math.round(x))*4;
    const nx=pixels[p]/127.5-1,ny=pixels[p+1]/127.5-1,nz=pixels[p+2]/127.5-1;
    const face=clamp(.55-nx*.32+ny*.25+nz*.22,.22,1);
    const u=(x-minX)/patch+phase,v=(y-minY)/patch+phase*.43;
    const field=.72*noise(u,v,seed)+.28*noise(u*2.3,v*2.3,seed+37);
    let glimmer=0;
    for(const center of centers){
      const dx=(x-center.x)/center.rx,dy=(y-center.y)/center.ry;
      glimmer=Math.max(glimmer,Math.exp(-(dx*dx+dy*dy)*1.6)*center.strength);
    }
    const cloudVeil=.05+cloud*.15;
    const texture=smooth((field-.20)/.57),spark=smooth((glimmer-.08)/.65);
    const tone=clamp((cloudVeil+texture*.42+spark*(.38+glint*.64))*(.65+face*.45));
    const orientation=noise(u*.64+8,v*.64-3,seed+19)*Math.PI*2;
    const drift=noise(u*2.2,v*2.2,seed+91)-.5;
    const angle=-.65+wind*.12+Math.sin(orientation)*flow*1.5+drift*(1-flow*.6)*2.8+(random()-.5)*scatter*(4.8-spark*3.5);
    const jx=(random()-.5)*step*scatter*.24,jy=(random()-.5)*step*scatter*.24;
    const length=step*clamp((.12+texture*.40+spark*.32+rain*.07)*scale,.08,.82);
    const stroke=step*clamp((.048+tone*.10+spark*glint*.095)*scale,.025,.24);
    const alpha=clamp(.25+tone*(.63+contrast*.2),.16,.98);
    const mark={x:x+jx,y:y+jy,dx:Math.cos(angle)*length/2,dy:Math.sin(angle)*length/2,width:stroke,alpha,color,pattern,sky};
    marks.push(mark);
    dots.push({x,y,radius:step*.043,color,alpha:.18,sky});
    if(settings.mode==='layers'&&capture.frames.length>1)capture.frames.forEach((frame,index)=>{
      if(frame[p+3]<100)return;
      const offset=(index/(capture.frames.length-1)-.5)*step*.65;
      ghosts.push({...mark,x:mark.x+offset,y:mark.y-offset,alpha:alpha*.085});
    });
  }
  return {...plate,dots,marks,ghosts,mode:settings.mode,pattern,color};
}

export function drawPlate(canvas,plate,width=1500){
  canvas.width=width;canvas.height=Math.round(width*plate.paper.height/plate.paper.width);
  const ctx=canvas.getContext('2d'),scale=width/plate.paper.width;
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(scale,0,0,scale,0,0);ctx.fillStyle='#dce3e3';ctx.globalAlpha=.42;ctx.beginPath();
  for(let y=10;y<plate.paper.height-10;y+=7)for(let x=10;x<plate.paper.width-10;x+=7){ctx.moveTo(x+.38,y);ctx.arc(x,y,.38,0,Math.PI*2);}
  ctx.fill();
  const layer=typeof OffscreenCanvas==='function'?new OffscreenCanvas(canvas.width,canvas.height):null;
  const ink=layer?layer.getContext('2d'):ctx;
  ink.setTransform(scale*plate.paper.scale,0,0,scale*plate.paper.scale,scale*plate.paper.x,scale*plate.paper.y);
  if(!layer){ink.save();ink.beginPath();for(const run of plate.clipRuns)ink.rect(...run);ink.clip();}
  ink.fillStyle=plate.color;ink.globalAlpha=.18;ink.beginPath();
  for(const dot of plate.dots){ink.moveTo(dot.x+dot.radius,dot.y);ink.arc(dot.x,dot.y,dot.radius,0,Math.PI*2);}
  ink.fill();ink.lineCap='round';
  // Quantized ink batches keep large exports fast; clip the finished ink only once.
  for(const marks of [plate.ghosts,plate.marks]){
    const batches=new Map();
    for(const mark of marks){
      const key=`${Math.round(mark.alpha*48)}:${Math.round(mark.width*32)}`;
      if(!batches.has(key))batches.set(key,[]);batches.get(key).push(mark);
    }
    for(const [key,batch] of batches){
      const [alpha,lineWidth]=key.split(':').map(Number);
      ink.globalAlpha=alpha/48;ink.lineWidth=Math.max(1/32,lineWidth/32);ink.strokeStyle=plate.color;ink.fillStyle=plate.color;ink.beginPath();
      for(const mark of batch){
        const {x,y,dx,dy}=mark;
        if(plate.pattern==='grain'){
          const radius=Math.max(mark.width*.6,Math.hypot(dx,dy)*.42);
          ink.moveTo(x+radius,y);ink.arc(x,y,radius,0,Math.PI*2);
        }else{
          ink.moveTo(x-dx,y-dy);ink.lineTo(x+dx,y+dy);
          if(plate.pattern==='crosshatch'){ink.moveTo(x+dy*.65,y-dx*.65);ink.lineTo(x-dy*.65,y+dx*.65);}
        }
      }
      if(plate.pattern==='grain')ink.fill();else ink.stroke();
    }
  }
  if(layer){
    ink.globalAlpha=1;ink.globalCompositeOperation='destination-in';ink.beginPath();for(const run of plate.clipRuns)ink.rect(...run);ink.fill();
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.drawImage(layer,0,0);
  }else ctx.restore();
  ctx.globalAlpha=1;ctx.setTransform(1,0,0,1,0,0);
}
