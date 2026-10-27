import * as exifr from 'exifr';
import type { Photo, Result } from './types';

export type BrowserPhotoFile = {file:File;path:string};
type Settings = {maxGapSeconds:number;bracketSize:number;minSpanEv:number};
export const isDesktop = ():boolean => '__TAURI_INTERNALS__' in window;
export async function chooseDesktopFolder():Promise<string|null> {
  const {open}=await import('@tauri-apps/plugin-dialog');
  const directory=await open({directory:true,multiple:false,title:'Select DSLR photo folder'});
  return typeof directory==='string'?directory:null;
}
function toNumber(value:unknown):number|null {
  if(typeof value==='number' && Number.isFinite(value))return value;
  if(typeof value==='string'){const parts=value.trim().split('/');const n=parts.length===2?Number(parts[0])/Number(parts[1]):Number(value);return Number.isFinite(n)?n:null;}
  return null;
}
function timestamp(input:string):number|null {
  const m=input.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if(!m)return null;
  const [year,mon,day,hour,min,sec]=m.slice(1).map(Number);
  return Date.UTC(year,mon-1,day,hour,min,sec)/1000;
}
function timestampString(value:unknown):string {
  if(value instanceof Date) {
    return [value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join(':')+
      ' '+[value.getHours(),value.getMinutes(),value.getSeconds()].map(x=>String(x).padStart(2,'0')).join(':');
  }
  return typeof value==='string'?value:'';
}
const supported=/\.(dng|cr2|cr3|nef|arw|raf|orf|rw2|jpg|jpeg|tif|tiff)$/i;
async function readMetadata(entry:BrowserPhotoFile):Promise<Photo> {
  const meta=await exifr.parse(entry.file, {tiff:true,exif:true,translateValues:false}) as Record<string,unknown>|undefined;
  if(!meta)throw new Error('No readable EXIF');
  const exposureTime=toNumber(meta.ExposureTime);
  const aperture=toNumber(meta.FNumber);
  const iso=toNumber(meta.ISO);
  const ev100=exposureTime&&aperture&&iso&&exposureTime>0&&aperture>0&&iso>0?
    Math.log2(aperture*aperture/exposureTime)-Math.log2(iso/100):null;
  return {path:entry.path,name:entry.file.name,camera:[meta.Make,meta.Model,meta.SerialNumber].filter(Boolean).join(' '),
    takenAt:timestampString(meta.DateTimeOriginal), exposureTime,aperture,iso,ev100,
    exposureBias:toNumber(meta.ExposureCompensation??meta.ExposureBiasValue),
    focalLength:toNumber(meta.FocalLength),
    lensModel:typeof meta.LensModel==='string'?meta.LensModel:typeof meta.Lens==='string'?meta.Lens:null,
    width:toNumber(meta.ExifImageWidth??meta.ImageWidth??meta.PixelXDimension),
    height:toNumber(meta.ExifImageHeight??meta.ImageHeight??meta.PixelYDimension)};
}
function groupPhotos(photos:Photo[],settings:Settings):Result {
  const sorted=[...photos].sort((a,b)=>a.camera.localeCompare(b.camera)||a.takenAt.localeCompare(b.takenAt)||a.path.localeCompare(b.path));
  const used=new Set<number>();const groups:Result['groups']=[];const size=Math.max(3,Math.min(9,settings.bracketSize));
  for(let start=0;start<sorted.length;start++){
    if(used.has(start))continue;
    const first=sorted[start],startTime=timestamp(first.takenAt);
    if(startTime===null)continue;
    const candidates=[start];
    for(let j=start+1;j<sorted.length && candidates.length<size;j++){
      if(used.has(j))continue;
      const other=sorted[j];if(other.camera!==first.camera)break;
      const t=timestamp(other.takenAt);if(t===null)continue;
      if(t-startTime>settings.maxGapSeconds)break;
      if(Math.abs((first.aperture??0)-(other.aperture??0))>0.15)continue;
      if(Math.abs((first.focalLength??0)-(other.focalLength??0))>1)continue;
      candidates.push(j);
    }
    if(candidates.length!==size)continue;
    const evs=candidates.map(i=>sorted[i].ev100);
    if(evs.some(ev=>ev===null))continue;
    const numbers=(evs as number[]).sort((a,b)=>a-b);
    const span=numbers[size-1]-numbers[0];if(span<settings.minSpanEv)continue;
    const avg=span/(size-1);
    if(numbers.slice(1).some((ev,i)=>Math.abs(ev-numbers[i]-avg)>0.55||ev-numbers[i]<=0.25))continue;
    groups.push({id:groups.length+1,photos:candidates.map(i=>sorted[i]),confidence:first.camera?90:75,
      exposureSpan:Math.round(span*10)/10,reason:'Consistent exposure spacing, camera and capture time'});
    candidates.forEach(i=>used.add(i));
  }
  return {photoCount:sorted.length,groups,unmatched:sorted.filter((_,i)=>!used.has(i))};
}
export async function scanPhotos(folder:string,webFiles:BrowserPhotoFile[],settings:Settings):Promise<Result>{
  if(isDesktop()){
    const {invoke}=await import('@tauri-apps/api/core');
    const photos = await invoke<Photo[]>('scan_folder',{folder});
    return groupPhotos(photos,settings);
  }
  const files=webFiles.filter(f=>supported.test(f.path));
  const photos:Photo[]=[];const errors:string[]=[];
  for(const file of files){
    try{photos.push(await readMetadata(file));}catch(e){errors.push(file.path+': '+String(e));}
  }
  if(files.length && !photos.length)throw new Error('Cannot read EXIF from the selected files. Browser EXIF support varies by RAW format. '+errors[0]);
  // Files without readable metadata remain unmatched, preserving the photo count.
  const res=groupPhotos(photos,settings);
  for(const entry of files){
    if(photos.some(p=>p.path===entry.path))continue;
    res.unmatched.push({path:entry.path,name:entry.file.name,camera:'',takenAt:'',exposureTime:null,aperture:null,iso:null,exposureBias:null,focalLength:null,ev100:null});
  }
  res.photoCount=files.length;
  return res;
}

/**
 * Desktop-only adapter. Imports exactly the raster bytes from the folder the
 * user selected; both desktop and web then use the same React preview and
 * mergeHdr() engine. No native-only HDR algorithm or UI is introduced.
 */
export async function loadDesktopRasterFiles(photos:Photo[]):Promise<BrowserPhotoFile[]> {
  if(!isDesktop()) return [];
  const {invoke}=await import('@tauri-apps/api/core');
  const files:BrowserPhotoFile[]=[];
  for(const photo of photos) {
    if(!/\.(jpe?g|png|webp)$/i.test(photo.path)) continue;
    const raster=await invoke<{bytes:number[];mime:string}>('read_raster_photo',{path:photo.path});
    const file=new File([new Uint8Array(raster.bytes)],photo.name,{type:raster.mime});
    files.push({file,path:photo.path});
  }
  return files;
}
