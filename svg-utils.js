export const svgNumber=value=>String(Math.round(value*10000)/10000);
export const svgAttribute=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
export function circlePath(x,y,r){
  const n=svgNumber;
  return `M${n(x-r)} ${n(y)}a${n(r)} ${n(r)} 0 1 0 ${n(2*r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2*r)} 0Z`;
}
export function silhouettePath(runs){
  const n=svgNumber;
  return runs.map(([x,y,w,h])=>`M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`).join('');
}

// Shared portrait paper and model transform for the monochrome maps.
export function startPaperSvg(plate,width,title){
  const p=plate.paper,n=svgNumber;
  let background='';
  for(let y=10;y<p.height-10;y+=7)for(let x=10;x<p.width-10;x+=7)background+=circlePath(x,y,.38);
  return [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.round(width*p.height/p.width)}" viewBox="0 0 ${p.width} ${p.height}">`,
    `<title>${svgAttribute(title)}</title><rect width="100%" height="100%" fill="#fff"/>`,
    `<path fill="#dce3e3" opacity=".42" d="${background}"/>`,
    `<g transform="translate(${n(p.x)} ${n(p.y)}) scale(${n(p.scale)})">`,
    `<defs><clipPath id="model-silhouette" clipPathUnits="userSpaceOnUse"><path d="${silhouettePath(plate.clipRuns)}"/></clipPath></defs>`,
    '<g clip-path="url(#model-silhouette)">'];
}
