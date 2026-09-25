import { normalizePatterns, DEFAULT_BASE_COLOR } from './pattern-settings.js';
import { svgNumber as n, svgAttribute as attr, circlePath as circle, silhouettePath } from './svg-utils.js';

const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
export const PALETTE = { rain: [97,147,148], wind: [208,224,177], flood: [253,173,164], sun: [232,184,108] };
const DITHER = [0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21];
const CHANNELS = ['rain','wind','flood','sun'];
export function seeded(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function gradient(color, progress, strength) {
  const t = clamp(progress), fade = strength / 100;
  // Deeper ink at the origin, a visibly lighter tint at the far end.
  return `rgb(${[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)).map(c => Math.round(t < .28 ? c * (1 - .32*fade*(1-t/.28)) : c + (255-c)*fade*Math.pow((t-.28)/.72,.8))).join(',')})`;
}

export function makePlate(capture, settings, weather, seed) {
  const { width, height, frames } = capture;
  const patterns = normalizePatterns(settings.patterns);
  const baseColor = /^#[\da-f]{6}$/i.test(settings.baseColor || '') ? settings.baseColor : DEFAULT_BASE_COLOR;
  const step = width / settings.density, unit = width / 760;
  const surfaceMask = new Uint8Array(width * height);
  const columnTop = new Int32Array(width).fill(height), columnBottom = new Int32Array(width).fill(-1);
  let minX=width, maxX=-1, minY=height, maxY=-1;
  for (const pixels of frames) for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    if(pixels[((height-y-1)*width+x)*4+3]<100) continue;
    surfaceMask[y*width+x]=1;
    columnTop[x]=Math.min(columnTop[x],y); columnBottom[x]=Math.max(columnBottom[x],y);
    minX=Math.min(minX,x); maxX=Math.max(maxX,x); minY=Math.min(minY,y); maxY=Math.max(maxY,y);
  }
  if(maxX<minX || maxY<minY) throw new Error('当前视角没有可见模型，请点击适配模型后重试。');
  const clipRuns=[];
  for(let y=minY;y<=maxY;y++) {
    let start=-1;
    for(let x=minX;x<=maxX+1;x++) {
      const occupied=x<=maxX&&surfaceMask[y*width+x];
      if(occupied&&start<0)start=x;
      if(!occupied&&start>=0){clipRuns.push([start-.5,y-.5,x-start,1]);start=-1;}
    }
  }
  const spanX=maxX-minX,spanY=maxY-minY;
  const inside=(x,y)=>{x=Math.round(x);y=Math.round(y);return x>=0&&x<width&&y>=0&&y<height&&surfaceMask[y*width+x]===1;};
  const supported=(x,y,r=0)=>inside(x,y)&&inside(x-r,y)&&inside(x+r,y)&&inside(x,y-r)&&inside(x,y+r);
  const raw=[],threads=[],sunshine=[];
  function stroke(channel,x1,y1,x2,y2,weight,progress) {
    const p=patterns[channel];
    raw.push({channel,x1,y1,x2,y2,width:weight,color:gradient(p.color,progress,p.fade),alpha:clamp(settings.intensity)*p.opacity/100});
  }
  const active = channel => weather && settings.intensity>0 && settings.channels[channel] && patterns[channel].amount>0 && patterns[channel].opacity>0;
  const days=weather?.days || [];
  // Independent random streams keep other elements stable when one is toggled.
  for(const [channelIndex,channel] of CHANNELS.entries()) {
    if(!active(channel)) continue;
    const p=patterns[channel],random=seeded(seed+channelIndex*104729),jitter=p.variation/100;
    if(channel==='rain') {
      const pool=days.filter(d=>d.precipitation>.1);
      if(!pool.length) continue;
      const pitch=step*(.7+p.spacing/100*1.1), weight=p.width*unit;
      const offset=random()*pitch;
      for(let xf=minX+offset;xf<=maxX;xf+=pitch) {
        const x=Math.round(xf),top=columnTop[x],bottom=columnBottom[x];
        if(bottom-top<spanY*.28 || random()>p.amount/100) continue;
        const precipitation=pool[Math.floor(random()*pool.length)].precipitation;
        const reach=2/3+(1/3)*clamp(precipitation/45)*p.length/100;
        const length=(bottom-top)*reach;
        threads.push({channel,x:xf,top,bottom,length,width:weight});
        const phase=random()*Math.PI*2,segment=step*(.6+p.spacing/100*.65);
        const lean=Math.tan(p.angle*Math.PI/360)*step*2;
        for(let y=top,i=0;y<top+length;y+=segment,i++) {
          const progress=(y-top)/Math.max(1,length);
          const wave=t=>Math.sin(t/step*.7+phase)*step*.13*jitter;
          let x1=xf+wave(y)+lean*progress,x2=xf+wave(y+segment)+lean*(progress+segment/length);
          const end=Math.min(top+length,y+segment*(p.pattern==='continuous'?1:i%3===0?.16:.68));
          if(p.pattern==='zigzag'){x1=xf+(i%2?1:-1)*step*.22+lean*progress;x2=xf-(i%2?1:-1)*step*.22+lean*progress;}
          stroke(channel,x1,y,x2,end,weight,progress);
        }
      }
    } else if(channel==='wind') {
      const pool=days.filter(d=>d.wind>.5);
      if(!pool.length) continue;
      if(p.pattern==='blocks') {
        const count=Math.max(1,Math.round(p.amount/100*14)),inset=.03+p.spacing/100*.15;
        for(let i=0;i<count;i++) {
          const d=pool[Math.floor(random()*pool.length)],speed=clamp(d.wind/45);
          const direction=(d.direction||0)*Math.PI/180,az=(capture.angles?.azimuth||0)*Math.PI/180;
          const flow=-Math.sin(direction)*Math.cos(az)-Math.cos(direction)*Math.sin(az);
          const angle=Math.atan((.1+speed*.65)*flow)+p.angle*Math.PI/180+(random()-.5)*jitter*.65;
          // Distribute complete blocks through the facade, not on the dot grid.
          const level=(i+.5+(random()-.5)*jitter*.8)/count;
          let x,y;
          for(let attempt=0;attempt<100;attempt++) {
            x=minX+spanX*(inset+random()*(1-2*inset));
            y=minY+spanY*(inset+level*(1-2*inset));
            if(inside(x,y))break;
          }
          if(!inside(x,y)) {const run=clipRuns[Math.floor(random()*clipRuns.length)];x=run[0]+run[2]/2;y=run[1]+.5;}
          const length=spanX*(.18+.3*p.length/100)*(.65+.35*speed)*(1+(random()-.5)*jitter);
          const weight=clamp(spanY*(.025+.045*speed)*(p.width/.9)*(1+(random()-.5)*jitter),unit*2,spanY*.2);
          const dx=length/2*Math.cos(angle),dy=length/2*Math.sin(angle);
          raw.push({channel,shape:'block',x1:x-dx,y1:y-dy,x2:x+dx,y2:y+dy,width:weight,
            color:p.color,stops:[0,.28,.65,1].map(offset=>({offset,color:gradient(p.color,flow<0?1-offset:offset,p.fade)})),
            alpha:clamp(settings.intensity)*p.opacity/100});
        }
        continue;
      }
      const stride=Math.max(step*.9,step*(.85+p.spacing/100)),phase=random()*Math.PI*2;
      for(let y=minY+step/2;y<maxY;y+=stride) for(let x=minX+step/2;x<maxX;x+=stride) {
        const band=(Math.sin(y/(step*4)+phase)+1)/2;
        if(!inside(x,y)||random()>p.amount/100*(.08+.72*band*band)) continue;
        const d=pool[Math.floor(random()*pool.length)],speed=clamp(d.wind/45);
        const direction=(d.direction||0)*Math.PI/180,az=(capture.angles?.azimuth||0)*Math.PI/180;
        const flow=-Math.sin(direction)*Math.cos(az)-Math.cos(direction)*Math.sin(az);
        const weaveRow=Math.floor(y/stride);
        const slope=(p.pattern==='herringbone'?(weaveRow%2?1:-1):1)*(.10+speed*.65)*flow;
        const angle=Math.atan(slope)+p.angle*Math.PI/180+(random()-.5)*jitter*.65;
        const length=step*(.45+p.length/100*1.8)*(1+(random()-.5)*jitter*.55);
        const weight=p.width*unit*(.6+speed*1.25);
        const progress=flow<0?(maxX-x)/Math.max(1,spanX):(x-minX)/Math.max(1,spanX);
        stroke(channel,x-length/2*Math.cos(angle),y-length/2*Math.sin(angle),x+length/2*Math.cos(angle),y+length/2*Math.sin(angle),weight,progress);
      }
    } else if(channel==='flood') {
      const pool=days.filter(d=>d.flood>.01);
      if(!pool.length) continue;
      const stride=Math.max(1,Math.round(1+p.spacing/40));
      for(let gx=0,xf=step/2;xf<width;xf+=step,gx++) {
        if(gx%stride!==0 || random()>p.amount/100)continue;
        const x=Math.round(xf),top=columnTop[x],bottom=columnBottom[x];
        if(bottom<=top)continue;
        const d=pool[Math.floor(random()*pool.length)];
        const reach=(bottom-top)*(.2+.7*clamp(d.flood))*p.length/100;
        const y0=(Math.floor((bottom-step/2)/step))*step+step/2;
        const weight=p.width*unit,phase=random()*Math.PI*2;
        const offset=t=>p.pattern==='wave'?Math.sin(t*.65+phase)*step*(.25+jitter*.6):p.pattern==='stepped'?(Math.floor(t/3)%2)*step:0;
        for(let y=y0,i=0;y>bottom-reach;y-=step,i++) {
          const y2=Math.max(bottom-reach,y-step),progress=(bottom-y)/Math.max(1,reach);
          const drift=progress*Math.tan(p.angle*Math.PI/360)*step*3;
          const x1=xf+offset(i)+drift,x2=xf+offset(i+1)+drift;
          const localWeight=weight*(1+jitter*.3*Math.sin(i*.9+phase));
          if(p.pattern==='stepped'&&x1!==x2){stroke(channel,x1,y,x2,y,localWeight,progress);stroke(channel,x2,y,x2,y2,localWeight,progress);}
          else stroke(channel,x1,y,x2,y2,localWeight,progress);
        }
      }
    } else {
      const strength=clamp((weather.sunnyDays||0)/Math.max(1,days.length));
      if(!strength)continue;
      const count=Math.round(58*Math.sqrt(strength)*p.amount/65);
      for(let i=0;i<count;i++) {
        const size=p.width*unit*(.65+random()*p.length/100);
        const angle=(p.angle+(random()-.5)*p.variation*.5+(p.pattern==='diamonds'?45:0))*Math.PI/180;
        const footprint=size*(p.pattern==='dots'?1:Math.abs(Math.cos(angle))+Math.abs(Math.sin(angle)));
        for(let attempt=0;attempt<120;attempt++) {
          const x=minX+random()*spanX,y=minY+spanY*(.025+.93*Math.pow(random(),1.3));
          const r=footprint/2,clearance=step*(.8+p.spacing/100*3.8);
          if(!supported(x,y,r)||!inside(x-r,y-r)||!inside(x+r,y+r)||!inside(x-r,y+r)||!inside(x+r,y-r))continue;
          let solid=true;
          for(let sy=Math.floor(y-r);sy<=Math.ceil(y+r)&&solid;sy++)for(let sx=Math.floor(x-r);sx<=Math.ceil(x+r);sx++)if(!inside(sx,sy)){solid=false;break;}
          if(!solid)continue;
          if(sunshine.some(s=>Math.abs(x-s.center)<(footprint+s.thickness)/2+clearance&&Math.abs(y-s.sunY)<(footprint+s.thickness)/2+clearance))continue;
          sunshine.push({center:x,sunY:y,thickness:footprint});
          raw.push({channel,x,y,size,shape:p.pattern,angle,color:gradient(p.color,(y-minY)/Math.max(1,spanY),p.fade),alpha:clamp(settings.intensity)*p.opacity/100});
          break;
        }
      }
    }
  }

  // Thin marks replace base dots; translucent layers never punch holes in each other.
  const occupied=new Uint8Array(width*height);
  const tile=Math.max(step*2.4,unit*8);
  const rankAt=(mark,x,y)=>{
    const channel=CHANNELS.indexOf(mark.channel),weave=patterns[mark.channel].weave/100;
    const turn=(Math.floor(x/tile)+Math.floor(y/tile))%4;
    return channel*(1-weave)+((channel+turn)%4)*weave;
  };
  function visit(mark,callback) {
    if(mark.channel==='sun') {
      const radius=mark.size*.72;
      for(let y=Math.floor(mark.y-radius);y<=Math.ceil(mark.y+radius);y++) for(let x=Math.floor(mark.x-radius);x<=Math.ceil(mark.x+radius);x++){
        const dx=x-mark.x,dy=y-mark.y,c=Math.cos(mark.angle),s=Math.sin(mark.angle);
        const hit=mark.shape==='dots'?dx*dx+dy*dy<=(mark.size/2)**2:Math.abs(dx*c+dy*s)<=mark.size/2&&Math.abs(-dx*s+dy*c)<=mark.size/2;
        if(hit&&inside(x,y))callback(x,y);
      }
      return;
    }
    const length=Math.hypot(mark.x2-mark.x1,mark.y2-mark.y1),n=Math.max(1,Math.ceil(length/.6));
    const radius=mark.width/2+unit*.85,r=Math.ceil(radius);
    for(let i=0;i<=n;i++) {
      const x=mark.x1+(mark.x2-mark.x1)*i/n,y=mark.y1+(mark.y2-mark.y1)*i/n;
      for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++) {
        if(dx*dx+dy*dy>Math.max(.5,radius)**2)continue;
        const xx=Math.round(x+dx),yy=Math.round(y+dy);
        if(inside(xx,yy))callback(xx,yy);
      }
    }
  }
  for(const mark of raw)if(mark.shape!=='block')visit(mark,(x,y)=>{occupied[y*width+x]=1;});
  const marks=[];
  for(const mark of raw) {
    const x=mark.channel==='sun'?mark.x:(mark.x1+mark.x2)/2;
    const y=mark.channel==='sun'?mark.y:(mark.y1+mark.y2)/2;
    mark.alpha*=.85+.15*rankAt(mark,x,y)/3;
    if(mark.channel==='sun'||mark.shape==='block'){marks.push(mark);continue;}
    const length=Math.hypot(mark.x2-mark.x1,mark.y2-mark.y1),n=Math.max(1,Math.ceil(length/.4));
    let start=null,last=null;
    const flush=()=>{if(start&&last&&Math.hypot(last.x-start.x,last.y-start.y)>.015)marks.push({...mark,x1:start.x,y1:start.y,x2:last.x,y2:last.y});start=null;last=null;};
    for(let i=0;i<=n;i++) {
      const x=mark.x1+(mark.x2-mark.x1)*i/n,y=mark.y1+(mark.y2-mark.y1)*i/n;
      const visible=supported(x,y,mark.width/2+unit*.3);
      if(visible){if(!start)start={x,y};last={x,y};}else flush();
    }
    flush();
  }
  const dots=[];
  for(let layer=frames.length-1;layer>=0;layer--) {
    const pixels=frames[layer],phase=frames.length>1?(layer/frames.length-.5)*step*.75:0;
    for(let yf=step/2;yf<height;yf+=step) for(let xf=step/2;xf<width;xf+=step) {
      const x=Math.round(xf),y=Math.round(yf);
      if(x>=width||y>=height)continue;
      const p=((height-y-1)*width+x)*4;
      if(pixels[p+3]<100)continue;
      const nx=pixels[p]/127.5-1,ny=pixels[p+1]/127.5-1,nz=pixels[p+2]/127.5-1;
      const light=clamp(nx*-.48+ny*.61+nz*.63),ink=clamp(.61+(.46-light)*(1+settings.contrast*.95),.13,1);
      const gx=Math.floor(xf/step),gy=Math.floor(yf/step);
      const threshold=(DITHER[((gy+layer*3)%8)*8+(gx+layer*5)%8]+.5)/64;
      if(threshold>ink)continue;
      const radius=step*(frames.length>1?.35:.40),dx=xf+phase,dy=yf+phase;
      let replaced=false;
      for(let oy=-radius;oy<=radius&&!replaced;oy+=Math.max(.7,radius))for(let ox=-radius;ox<=radius;ox+=Math.max(.7,radius)){
        const xx=Math.round(dx+ox),yy=Math.round(dy+oy);
        if(xx>=0&&xx<width&&yy>=0&&yy<height&&occupied[yy*width+xx]){replaced=true;break;}
      }
      if(!replaced)dots.push({x:dx,y:dy,radius,color:baseColor,alpha:frames.length>1?.58+.30*(1-layer/frames.length):1});
    }
  }
  const order=mark=>mark.shape==='block'?0:mark.channel==='sun'?1:2;
  marks.sort((a,b)=>order(a)-order(b));
  return {width,height,dots,marks,threads,sunshine,clipRuns,seed,bounds:{minX,maxX,minY,maxY},weatherRange:weather?`${weather.start}/${weather.end}`:null,weatherSource:weather?.source||'none',mode:settings.mode,angles:capture.angles};
}

export function drawPlate(canvas, plate, width=1500) {
  canvas.width=width;canvas.height=Math.round(width*plate.height/plate.width);
  const ctx=canvas.getContext('2d'),scale=width/plate.width,margin=.105;
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(scale,0,0,scale,0,0);
  for(let y=5.5;y<plate.height-5.5;y+=5.5)for(let x=5.5;x<plate.width-5.5;x+=5.5){
    const tone=Math.round(244-10*Math.pow(y/plate.height,2));
    ctx.fillStyle=`rgb(${tone},${tone},${tone})`;ctx.beginPath();ctx.arc(x,y,.53,0,Math.PI*2);ctx.fill();
  }
  const modelScale=scale*(1-2*margin);
  ctx.setTransform(modelScale,0,0,modelScale,canvas.width*margin,canvas.height*margin);
  for(const dot of plate.dots){ctx.globalAlpha=dot.alpha;ctx.fillStyle=dot.color;ctx.beginPath();ctx.arc(dot.x,dot.y,dot.radius,0,Math.PI*2);ctx.fill();}
  // Clip the entire stroke footprint at diagonal facades.
  ctx.save();ctx.beginPath();
  for(const run of plate.clipRuns)ctx.rect(...run);
  ctx.clip();
  ctx.lineCap='butt';ctx.lineJoin='miter';
  for(const mark of plate.marks){
    ctx.globalAlpha=mark.alpha;
    if(mark.channel==='sun'){
      ctx.fillStyle=mark.color;ctx.beginPath();
      if(mark.shape==='dots')ctx.arc(mark.x,mark.y,mark.size/2,0,Math.PI*2);
      else {const c=Math.cos(mark.angle),s=Math.sin(mark.angle);[[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([dx,dy],i)=>{const x=mark.x+(dx*c-dy*s)*mark.size/2,y=mark.y+(dx*s+dy*c)*mark.size/2;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.closePath();}
      ctx.fill();
    }else{
      let ink=mark.color;
      if(mark.shape==='block') {
        ink=ctx.createLinearGradient(mark.x1,mark.y1,mark.x2,mark.y2);
        for(const stop of mark.stops)ink.addColorStop(stop.offset,stop.color);
      }
      ctx.strokeStyle=ink;ctx.lineWidth=mark.width;ctx.beginPath();ctx.moveTo(mark.x1,mark.y1);ctx.lineTo(mark.x2,mark.y2);ctx.stroke();
    }
  }
  ctx.restore();ctx.globalAlpha=1;ctx.setTransform(1,0,0,1,0,0);
}

export function serializePlateSvg(plate,width=1500) {
  const height=Math.round(width*plate.height/plate.width);
  const out=[`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${plate.width} ${plate.height}">`,
    '<title>Yiwu Color Map</title><rect width="100%" height="100%" fill="#fff"/>'];
  for(let y=5.5;y<plate.height-5.5;y+=5.5){
    const tone=Math.round(244-10*Math.pow(y/plate.height,2));
    let path='';for(let x=5.5;x<plate.width-5.5;x+=5.5)path+=circle(x,y,.53);
    out.push(`<path fill="rgb(${tone},${tone},${tone})" d="${path}"/>`);
  }
  out.push(`<g transform="translate(${n(plate.width*.105)} ${n(plate.height*.105)}) scale(.79)">`);
  // Batch equal inks without turning any dots or straight strokes into images.
  const dots=new Map();
  for(const dot of plate.dots){const key=JSON.stringify([dot.color,dot.alpha]);dots.set(key,(dots.get(key)||'')+circle(dot.x,dot.y,dot.radius));}
  for(const [key,path] of dots){const [color,alpha]=JSON.parse(key);out.push(`<path fill="${attr(color)}" opacity="${n(alpha)}" d="${path}"/>`);}
  const clip=silhouettePath(plate.clipRuns);
  out.push(`<defs><clipPath id="model-silhouette" clipPathUnits="userSpaceOnUse"><path d="${clip}"/></clipPath></defs>`,
    '<g clip-path="url(#model-silhouette)" stroke-linecap="butt" stroke-linejoin="miter">');
  for(const [index,mark] of plate.marks.entries()){
    const ink=`opacity="${n(mark.alpha)}"`;
    let color=mark.color;
    if(mark.shape==='block') {
      const id=`weather-block-${index}`;
      out.push(`<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(mark.x1)}" y1="${n(mark.y1)}" x2="${n(mark.x2)}" y2="${n(mark.y2)}">${mark.stops.map(stop=>`<stop offset="${n(stop.offset)}" stop-color="${attr(stop.color)}"/>`).join('')}</linearGradient></defs>`);
      color=`url(#${id})`;
    }
    if(mark.channel==='sun'){
      if(mark.shape==='dots')out.push(`<circle cx="${n(mark.x)}" cy="${n(mark.y)}" r="${n(mark.size/2)}" fill="${attr(mark.color)}" ${ink}/>`);
      else out.push(`<rect x="${n(mark.x-mark.size/2)}" y="${n(mark.y-mark.size/2)}" width="${n(mark.size)}" height="${n(mark.size)}" transform="rotate(${n(mark.angle*180/Math.PI)} ${n(mark.x)} ${n(mark.y)})" fill="${attr(mark.color)}" ${ink}/>`);
    }else out.push(`<path data-channel="${attr(mark.channel)}" d="M${n(mark.x1)} ${n(mark.y1)}L${n(mark.x2)} ${n(mark.y2)}" fill="none" stroke="${attr(color)}" stroke-width="${n(mark.width)}" ${ink}/>`);
  }
  out.push('</g></g></svg>');
  return out.join('');
}
