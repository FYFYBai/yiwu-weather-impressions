import { makePlate as makeSurfacePlate, skyRatios } from './art-transparency.js';
import { seeded } from './art-legacy.js';
import { svgNumber as n, svgAttribute as attr, circlePath, startPaperSvg } from './svg-utils.js';

export { skyRatios };
export const DEFAULT_REFLECTIVITY_COLOR='#303838';
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
  const density=clamp(Number.isFinite(settings.density)?settings.density:260,60,600),step=capture.width/density;
  // Reuse the established surface sampling, paper framing and silhouette mask.
  // Reflectivity is an artistic weather mapping, not a physical material estimate.
  const plate=makeSurfacePlate(capture,{...settings,density,mode:'surface',transparency:{color,scale:100,variation:0}},weather,seed);
  const {minX,maxX,minY,maxY}=plate.bounds,spanX=maxX-minX+1,spanY=maxY-minY+1;
  const pixels=capture.surface||capture.frames[0],random=seeded(seed),phase=random()*40;
  const ratios=plate.ratios,rain=ratios?.rainy||0,sun=ratios?.sunny||0,cloud=ratios?.cloudy||0;
  const patch=Math.max(spanX*.16,spanY*.085,step*9);
  const wind=Number.isFinite(weather?.east)&&Number.isFinite(weather?.north)?Math.atan2(weather.east,weather.north):0;
  const fields=plate.dots.map(({x,y})=>{
    const u=(x-minX)/patch+phase,v=(y-minY)/patch+phase*.43;
    const warp=(noise(u*.65+7,v*.65-4,seed+13)-.5)*.5;
    return .60*noise(u+warp,v-warp,seed)+.30*noise(u*1.9+3,v*1.9,seed+37)+.10*noise(u*3.7,v*3.7,seed+61);
  });
  const mean=fields.reduce((sum,value)=>sum+value,0)/Math.max(1,fields.length);
  const deviation=Math.max(.10,Math.sqrt(fields.reduce((sum,value)=>sum+(value-mean)**2,0)/Math.max(1,fields.length)));
  const contrast=control(settings.contrast===undefined?65:settings.contrast*100,65);
  const marks=[],dots=[],ghosts=[];
  for(const [index,sample] of plate.dots.entries()){
    const {x,y,sky}=sample,p=((capture.height-Math.round(y)-1)*capture.width+Math.round(x))*4;
    const nx=pixels[p]/127.5-1,ny=pixels[p+1]/127.5-1,nz=pixels[p+2]/127.5-1;
    const face=clamp(.55-nx*.32+ny*.25+nz*.22,.22,1);
    const u=(x-minX)/patch+phase,v=(y-minY)/patch+phase*.43;
    const field=(fields[index]-mean)/deviation;
    const tone=clamp((1/(1+Math.exp(-field*(.90+glint*.50)))+cloud*.035)*(.82+face*.23));
    const texture=smooth((tone-.12)/.67),spark=smooth((tone-(.66-sun*.04))/.26);
    // Diffuse areas scatter short flecks; dark areas align into crisp, slanted
    // hatch patches. Surface normals reverse the slant across building folds.
    const direction=(nx<-.08?-.55:.55)+ny*.18+wind*.06;
    const drift=(noise(u*1.4,v*1.4,seed+91)-.5)*.35;
    const alignment=clamp(.10+flow*(.16+spark*1.3),0,.97);
    const loose=(random()-.5)*Math.PI;
    const angle=(direction+drift)*alignment+loose*(1-alignment)+(random()-.5)*scatter*.6;
    const jx=(random()-.5)*step*scatter*.18,jy=(random()-.5)*step*scatter*.18;
    const length=step*clamp((.065+texture*.60+spark*.105+rain*.035)*scale,.035,.80);
    const stroke=step*clamp((.048+texture*.045+spark*(.085+glint*.11))*scale,.025,.24);
    const alpha=clamp(.40+texture*.31+spark*(.20+contrast*.14),.16,.99);
    const mark={x:x+jx,y:y+jy,dx:Math.cos(angle)*length/2,dy:Math.sin(angle)*length/2,width:stroke,alpha,color,pattern,sky};
    marks.push(mark);
    dots.push({x,y,radius:step*.07,color,alpha:.42,sky});
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
  ink.fillStyle=plate.color;ink.globalAlpha=.42;ink.beginPath();
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

export function serializePlateSvg(plate,width=1500){
  const out=startPaperSvg(plate,width,'Yiwu Reflectivity Map');
  out.push(`<path fill="${attr(plate.color)}" opacity=".42" d="${plate.dots.map(dot=>circlePath(dot.x,dot.y,dot.radius)).join('')}"/>`);
  // Match the preview's ink quantization and compositing order exactly.
  for(const marks of [plate.ghosts,plate.marks]){
    const batches=new Map();
    for(const mark of marks){
      const key=`${Math.round(mark.alpha*48)}:${Math.round(mark.width*32)}`;
      if(!batches.has(key))batches.set(key,[]);batches.get(key).push(mark);
    }
    for(const [key,batch] of batches){
      const [alpha,lineWidth]=key.split(':').map(Number);
      let path='';
      for(const mark of batch){
        const {x,y,dx,dy}=mark;
        if(plate.pattern==='grain')path+=circlePath(x,y,Math.max(mark.width*.6,Math.hypot(dx,dy)*.42));
        else {
          path+=`M${n(x-dx)} ${n(y-dy)}L${n(x+dx)} ${n(y+dy)}`;
          if(plate.pattern==='crosshatch')path+=`M${n(x+dy*.65)} ${n(y-dx*.65)}L${n(x-dy*.65)} ${n(y+dx*.65)}`;
        }
      }
      const ink=plate.pattern==='grain'?`fill="${attr(plate.color)}"`:`fill="none" stroke="${attr(plate.color)}" stroke-width="${n(Math.max(1/32,lineWidth/32))}" stroke-linecap="round"`;
      out.push(`<path ${ink} opacity="${n(alpha/48)}" d="${path}"/>`);
    }
  }
  return out.join('')+'</g></g></svg>';
}
