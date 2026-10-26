import type {BrowserPhotoFile} from './platform';
import type {Photo} from './types';
type Options={maxWidth:number;strength:number};
async function decode(file:File):Promise<ImageBitmap>{
 try{return await createImageBitmap(file,{imageOrientation:'from-image'});}catch{throw Error('Cannot decode '+file.name+'. Convert unsupported RAW/TIFF to JPEG first.');}
}
function pixelBuffer(bitmap:ImageBitmap,width:number,height:number):Uint8ClampedArray{
 const c=document.createElement('canvas');c.width=width;c.height=height;
 const ctx=c.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas unavailable');
 ctx.drawImage(bitmap,0,0,width,height);
 return ctx.getImageData(0,0,width,height).data;
}
export async function mergeExposureFusion(entries:BrowserPhotoFile[],photos:Photo[],opts:Options):Promise<Blob>{
 if(entries.length<2)throw Error('At least two exposures are required.');
 const sorted=photos.map(p=>({photo:p,entry:entries.find(e=>e.path===p.path||e.file.name===p.name)}));
 if(sorted.some(x=>!x.entry))throw Error('Missing source image');
 const bitmaps=await Promise.all(sorted.map(x=>decode(x.entry!.file)));
 try{
  const reference=bitmaps[Math.floor(bitmaps.length/2)];
  const scale=Math.min(1,opts.maxWidth/reference.width),width=Math.max(1,Math.round(reference.width*scale)),height=Math.max(1,Math.round(reference.height*scale));
  const buffers=bitmaps.map(b=>pixelBuffer(b,width,height));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d');if(!context)throw Error('Canvas unavailable');
  const out=context.createImageData(width,height);
  const strength=Math.max(0,Math.min(1,opts.strength));
  for(let i=0;i<out.data.length;i+=4){
    let wr=0,wg=0,wb=0,total=0;
    const mid=buffers[Math.floor(buffers.length/2)];
    for(let frame=0;frame<buffers.length;frame++){
      const data=buffers[frame];const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255;
      const luminance=(r+g+b)/3;
      // Exposure fusion weights favour pixels away from clipped shadows/highlights.
      const exposure=Math.exp(-Math.pow((luminance-.5)/.26,2)/2)+.0001;
      const weight=(1-strength)+strength*exposure;
      wr+=r*weight;wg+=g*weight;wb+=b*weight;total+=weight;
    }
    out.data[i]=Math.round(255*(wr/total));out.data[i+1]=Math.round(255*(wg/total));out.data[i+2]=Math.round(255*(wb/total));out.data[i+3]=mid[i+3];
  }
  context.putImageData(out,0,0);
  return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('JPEG export failed')),'image/jpeg',.94));
 }finally{bitmaps.forEach(b=>b.close());}
}
