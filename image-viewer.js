const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function zoomAroundPoint({zoom,x,y},next,px=0,py=0){
  next=clamp(next,1,8);const ratio=next/zoom;
  return {zoom:next,x:px-(px-x)*ratio,y:py-(py-y)*ratio};
}

export function createArtworkViewer({canvas,title,trigger=canvas,vectorSource=null}) {
  const button=document.createElement('button');
  button.id='expand-artwork';button.className='icon artwork-expand';button.disabled=true;
  button.innerHTML='<i data-lucide="expand"></i>';
  canvas.parentElement.append(button);
  trigger.tabIndex=0;trigger.setAttribute('role','button');trigger.setAttribute('aria-haspopup','dialog');
  const dialog=document.createElement('dialog');
  dialog.className='artwork-dialog';dialog.setAttribute('aria-labelledby','artwork-viewer-title');
  dialog.innerHTML=`<div class="artwork-viewer-toolbar">
    <h2 id="artwork-viewer-title"></h2>
    <div class="artwork-viewer-tools">
      <button class="icon" data-viewer="out"><i data-lucide="zoom-out"></i></button>
      <output class="mono" id="artwork-zoom" aria-live="polite">100%</output>
      <button class="icon" data-viewer="in"><i data-lucide="zoom-in"></i></button>
      <button class="icon" data-viewer="fit"><i data-lucide="maximize"></i></button>
      <button class="icon" data-viewer="close" autofocus><i data-lucide="x"></i></button>
    </div>
  </div><div class="artwork-viewer-stage">${vectorSource?'<img id="artwork-detail" draggable="false" alt="">':'<canvas id="artwork-detail" role="img"></canvas>'}</div>`;
  document.body.append(dialog);
  dialog.querySelector('h2').textContent=title;
  const stage=dialog.querySelector('.artwork-viewer-stage'),detail=dialog.querySelector('#artwork-detail');
  const action=name=>dialog.querySelector(`[data-viewer="${name}"]`);
  let available=false,zoom=1,fitScale=1,x=0,y=0,returnFocus;
  const pointers=new Map();let gesture=null;

  function labels(){
    const zh=document.documentElement.lang.startsWith('zh');
    const open=zh?'放大查看图片':'Enlarge print';
    button.title=open;button.setAttribute('aria-label',open);trigger.title=open;trigger.setAttribute('aria-label',open);
    for(const [key,en,cn] of [['out','Zoom out','缩小'],['in','Zoom in','放大'],['fit','Fit image','适配图片'],['close','Close preview','关闭预览']]){
      action(key).title=zh?cn:en;action(key).setAttribute('aria-label',zh?cn:en);
    }
    detail.setAttribute('aria-label',zh?'生成图片大图预览':'Enlarged generated print');
  }
  labels();document.addEventListener('studio-language-change',labels);

  function paint(){
    const w=canvas.width*fitScale*zoom,h=canvas.height*fitScale*zoom;
    const limitX=Math.max(0,(w-stage.clientWidth)/2+24),limitY=Math.max(0,(h-stage.clientHeight)/2+24);
    x=clamp(x,-limitX,limitX);y=clamp(y,-limitY,limitY);
    detail.style.width=`${w}px`;detail.style.height=`${h}px`;
    detail.style.transform=`translate(-50%,-50%) translate(${x}px,${y}px)`;
    dialog.querySelector('output').textContent=`${Math.round(zoom*100)}%`;
    action('out').disabled=zoom<=1;action('in').disabled=zoom>=8;
    stage.classList.toggle('is-zoomed',zoom>1);
  }
  function fit(){
    if(!dialog.open)return;
    fitScale=Math.max(.01,Math.min((stage.clientWidth-32)/canvas.width,(stage.clientHeight-32)/canvas.height));
    zoom=1;x=0;y=0;paint();
  }
  function zoomTo(next,px=0,py=0){
    ({zoom,x,y}=zoomAroundPoint({zoom,x,y},next,px,py));paint();
  }
  function location(event){const rect=stage.getBoundingClientRect();return {x:event.clientX-rect.left-stage.clientWidth/2,y:event.clientY-rect.top-stage.clientHeight/2};}
  function refresh(){
    if(!dialog.open)return;
    const resized=Number(detail.getAttribute('width'))!==canvas.width||Number(detail.getAttribute('height'))!==canvas.height;
    detail.setAttribute('width',canvas.width);detail.setAttribute('height',canvas.height);
    if(vectorSource)detail.src=vectorSource();
    else detail.getContext('2d').drawImage(canvas,0,0);
    if(resized)fit();else paint();
  }
  function open(){
    if(!available||dialog.open)return;
    returnFocus=document.activeElement;dialog.showModal();document.body.classList.add('artwork-viewer-open');
    refresh();fit();
  }
  button.onclick=open;trigger.addEventListener('click',open);
  trigger.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
  action('in').onclick=()=>zoomTo(zoom*1.4);action('out').onclick=()=>zoomTo(zoom/1.4);
  action('fit').onclick=fit;action('close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{pointers.clear();gesture=null;stage.classList.remove('is-dragging');document.body.classList.remove('artwork-viewer-open');returnFocus?.focus({preventScroll:true});});
  dialog.addEventListener('keydown',event=>{
    if(['+','=','-','0'].includes(event.key)){event.preventDefault();if(event.key==='0')fit();else zoomTo(zoom*(event.key==='-'?1/1.4:1.4));}
    if(zoom>1&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
      event.preventDefault();x+=event.key==='ArrowLeft'?40:event.key==='ArrowRight'?-40:0;y+=event.key==='ArrowUp'?40:event.key==='ArrowDown'?-40:0;paint();
    }
  });
  stage.addEventListener('wheel',event=>{event.preventDefault();const point=location(event);zoomTo(zoom*Math.exp(-clamp(event.deltaY,-100,100)*.004),point.x,point.y);},{passive:false});
  stage.addEventListener('dblclick',event=>{const point=location(event);zoomTo(zoom>1?1:2.5,point.x,point.y);});
  function resetGesture(){
    const points=[...pointers.values()];
    if(points.length>=2){const [a,b]=points;gesture={x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y)};}
    else gesture=points[0]||null;
  }
  stage.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    pointers.set(event.pointerId,location(event));stage.setPointerCapture(event.pointerId);resetGesture();stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove',event=>{
    if(!pointers.has(event.pointerId))return;
    pointers.set(event.pointerId,location(event));const previous=gesture;resetGesture();
    if(!previous||!gesture)return;
    x+=gesture.x-previous.x;y+=gesture.y-previous.y;
    if(pointers.size>=2&&previous.distance>0)zoomTo(zoom*gesture.distance/previous.distance,gesture.x,gesture.y);else paint();
  });
  const release=event=>{pointers.delete(event.pointerId);resetGesture();if(!pointers.size)stage.classList.remove('is-dragging');};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,release);
  new ResizeObserver(fit).observe(stage);
  return {refresh,setAvailable(value){available=value;button.disabled=!value;trigger.setAttribute('aria-disabled',String(!value));}};
}
