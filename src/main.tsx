import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {isDesktop,scanPhotos,chooseDesktopFolder,type BrowserPhotoFile} from './platform';
import {mergeHdr,type DeghostLevel} from './hdr';
import {Aperture,FolderOpen,Images,Settings2,CheckCircle2,AlertCircle,Download} from 'lucide-react';
import type {Photo,Result} from './types';
import './style.css';
const exposure=(p:Photo)=>p.exposureTime&&p.exposureTime<1?`1/${Math.round(1/p.exposureTime)}s`:p.exposureTime?`${p.exposureTime}s`:'Unknown';
const raster=(name:string)=>/\.(jpe?g|png|webp)$/i.test(name);
function App(){
 const [folder,setFolder]=useState(''),[webFiles,setWebFiles]=useState<BrowserPhotoFile[]>([]);
 const [result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [gap,setGap]=useState(5),[size,setSize]=useState(3),[minSpan,setMinSpan]=useState(2);
 const [active,setActive]=useState<number|null>(null),[processing,setProcessing]=useState(false);
 const [output,setOutput]=useState<string|null>(null),[hdrOutput,setHdrOutput]=useState<string|null>(null);
 const [offsets,setOffsets]=useState<{name:string;x:number;y:number}[]>([]);
 const [autoAlign,setAutoAlign]=useState(true),[autoTone,setAutoTone]=useState(true);
 const [deghost,setDeghost]=useState<DeghostLevel>('low');
 const [exposureEV,setExposureEV]=useState(0),[highlightCompression,setHighlightCompression]=useState(50);
 const [maxWidth,setMaxWidth]=useState(2400);
 const [manual,setManual]=useState<BrowserPhotoFile[]>([]);
 const sources=webFiles.length?webFiles:manual;
 const urls=useMemo(()=>new Map(sources.filter(f=>raster(f.path)).map(f=>[f.path,URL.createObjectURL(f.file)])),[sources]);
 useEffect(()=>()=>{for(const url of urls.values())URL.revokeObjectURL(url);},[urls]);
 useEffect(()=>()=>{if(output)URL.revokeObjectURL(output);},[output]);
 useEffect(()=>()=>{if(hdrOutput)URL.revokeObjectURL(hdrOutput);},[hdrOutput]);
 const filesFor=(photos:Photo[])=>photos.map(p=>sources.find(f=>f.path===p.path||f.file.name===p.name)).filter((f):f is BrowserPhotoFile=>!!f);
 async function pick(){if(isDesktop()){const dir=await chooseDesktopFolder();if(dir){setFolder(dir);setResult(null);setError('');}}else document.getElementById('browser-folder-input')?.click();}
 function chooseBrowserFiles(files:FileList|null){if(!files)return;const chosen=Array.from(files).map(file=>({file,path:file.webkitRelativePath||file.name}));setWebFiles(chosen);setManual([]);setFolder(chosen[0]?.path.split('/')[0]||'');setResult(null);setActive(null);setOutput(null);setHdrOutput(null);setError('');}
 async function scan(){if(!folder)return;setBusy(true);setError('');setOutput(null);setHdrOutput(null);try{const data=await scanPhotos(folder,webFiles,{maxGapSeconds:gap,bracketSize:size,minSpanEv:minSpan});setResult(data);setActive(data.groups[0]?.id??null);}catch(e){setError(String(e));}finally{setBusy(false);}}
 const group=result?.groups.find(g=>g.id===active);
 async function process(){if(!group)return;setProcessing(true);setError('');setOutput(null);setHdrOutput(null);
  try{const entries=filesFor(group.photos);if(entries.length!==group.photos.length)throw Error('Select the bracket JPEG/PNG files using “Choose images for preview”.');
   if(entries.some(e=>!raster(e.path)))throw Error('HDR preview processing currently supports JPEG, PNG or WebP only. RAW files require a decoder.');
   const merged=await mergeHdr(entries,group.photos,{maxWidth,autoAlign,deghost,autoTone,exposureEV,highlightCompression});
   setOutput(URL.createObjectURL(merged.jpeg));setHdrOutput(URL.createObjectURL(merged.radiance));setOffsets(merged.offsets);
  }catch(e){setError(String(e));}finally{setProcessing(false);}
 }
 return <div className="app"><aside className="sidebar"><div className="brand"><Aperture size={26}/><span>HDR<span className="light"> Studio</span></span></div><div className="nav"><div className="navitem active"><Images size={17}/> Library</div><div className="navitem"><Settings2 size={17}/> Processing</div></div><div className="sidebottom">Offline-first image processing<br/><small>v0.2 · Exposure fusion preview</small></div></aside><main><header><div><div className="overline">PHOTOGRAPHY WORKSPACE</div><h1>HDR Bracket Studio</h1><p>Identify exposure brackets, preview original photos and generate a fused JPEG.</p></div><Aperture size={32}/></header><section className="topgrid"><div className="panel"><div className="sectionhead"><FolderOpen size={20}/><h2>Import photographs</h2></div><p>Browser images remain on your computer. DSLR RAW metadata grouping is supported where EXIF can be read.</p><input id="browser-folder-input" type="file" multiple {...({webkitdirectory:'',directory:''} as React.InputHTMLAttributes<HTMLInputElement>)} style={{display:'none'}} onChange={e=>chooseBrowserFiles(e.target.files)}/><div className="filebox"><span className="path">{folder||'No folder selected'}</span><button className="ghost" onClick={pick}>Browse…</button></div><button className="primary" disabled={!folder||busy} onClick={scan}>{busy?'Scanning metadata…':'Scan for HDR brackets'}</button></div><div className="panel controls"><div className="sectionhead"><Settings2 size={20}/><h2>Detection settings</h2></div><label>Capture window <b>{gap}s</b></label><input type="range" min="1" max="15" value={gap} onChange={e=>setGap(+e.target.value)}/><label>Exposure frames<select value={size} onChange={e=>setSize(+e.target.value)}><option value="3">3 frames</option><option value="5">5 frames</option><option value="7">7 frames</option></select></label><label>Minimum exposure span <b>{minSpan} EV</b></label><input type="range" min="1" max="8" step=".5" value={minSpan} onChange={e=>setMinSpan(+e.target.value)}/></div></section>{error&&<p className="error"><AlertCircle size={15}/> {error}</p>}<section className="results"><div className="titleRow"><div><h2>Suggested stacks</h2><p>Choose a stack to inspect and process.</p></div>{result&&<span className="summary">{result.photoCount} photos · {result.groups.length} stacks · {result.unmatched.length} unmatched</span>}</div>{!result?<div className="empty"><Images size={46}/><h3>Your exposure brackets will appear here</h3><p>Choose a folder to start scanning.</p></div>:<>{result.groups.length===0&&<div className="empty"><AlertCircle size={36}/><h3>No HDR groups detected</h3><p>Try a longer capture window or smaller minimum EV span.</p></div>}{result.groups.map(g=><article className={'stack '+(g.id===active?'selectedStack':'')} key={g.id}><div className="stackTop"><button className="ghost" onClick={()=>{setActive(g.id);setOutput(null);setHdrOutput(null);}}>HDR stack #{g.id} {g.id===active?'· Selected':'· Select'}</button><span className="pill"><CheckCircle2 size={13}/>{g.confidence}% confidence</span><span className="muted">{g.exposureSpan.toFixed(1)} EV span</span></div><div className="exposures">{[...g.photos].sort((a,b)=>(b.ev100??0)-(a.ev100??0)).map(p=><div className="exposure" key={p.path}><div className="placeholder">{urls.has(p.path)||urls.has(p.name)?<img src={urls.get(p.path)||urls.get(p.name)} alt={p.name}/>:<><Aperture size={25}/><small>Preview unavailable</small></>}</div><div className="photoName" title={p.path}>{p.name}</div><div className="detail">{exposure(p)} · f/{p.aperture??'?'} · ISO {p.iso??'?'}</div></div>)}</div><div className="reason">{g.reason}. No geometric alignment or deghosting is applied.</div></article>)}<details><summary>{result.unmatched.length} unmatched photos</summary><div className="unmatchedList">{result.unmatched.map(p=><div key={p.path}>{p.name}<span>{p.takenAt||'No timestamp'}</span></div>)}</div></details></>}</section>{group&&<section className="panel editor"><div className="sectionhead"><Aperture size={20}/><h2>HDR preview · Stack #{group.id}</h2></div><p>Reconstruct linear-light radiance from DSLR exposure values, align frames, remove motion ghosting and tone-map the merged image. JPG preview is SDR; Radiance RGBE export preserves HDR data.</p>{isDesktop()&&<p>Desktop mode: select the matching JPEGs for processing; metadata scanning does not provide direct photo bytes to the renderer.</p>}
<div className="editorControls">
<label className="ghost fileButton">Choose source JPEGs<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{setManual(Array.from(e.target.files||[]).map(file=>({file,path:file.name})));setOutput(null);setHdrOutput(null);}}/></label>
<label><input type="checkbox" checked={autoAlign} onChange={e=>setAutoAlign(e.target.checked)}/> Auto align</label>
<label><input type="checkbox" checked={autoTone} onChange={e=>setAutoTone(e.target.checked)}/> Auto tone</label>
<label>Deghosting<select value={deghost} onChange={e=>setDeghost(e.target.value as DeghostLevel)}><option value="off">Off</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
<label>Exposure <b>{exposureEV>0?'+':''}{exposureEV.toFixed(1)} EV</b><input type="range" min="-2" max="2" step=".1" value={exposureEV} onChange={e=>setExposureEV(+e.target.value)}/></label>
<label>Highlight compression <b>{highlightCompression}%</b><input type="range" min="0" max="100" value={highlightCompression} onChange={e=>setHighlightCompression(+e.target.value)}/></label>
<label>Maximum width<select value={maxWidth} onChange={e=>setMaxWidth(+e.target.value)}><option value="1200">1200 px</option><option value="2400">2400 px</option><option value="4000">4000 px</option></select></label>
<button className="primary" disabled={processing} onClick={process}>{processing?'Processing frames…':'Merge HDR images'}</button>
</div>
{output&&<div className="output"><img src={output} alt="Tone-mapped HDR preview"/><div className="exportButtons"><a className="primary download" href={output} download={`HDR_stack_${group.id}.jpg`}><Download size={16}/> Download JPEG preview</a>{hdrOutput&&<a className="ghost download" href={hdrOutput} download={`HDR_stack_${group.id}.hdr`}><Download size={16}/> Download Radiance .hdr</a>}</div><p className="reason">Translation offsets: {offsets.map(o=>`${o.name}: (${o.x}, ${o.y})`).join(' · ')}</p></div>}
</section>}<footer>Local HDR radiance merging with translation alignment and basic deghosting · No RAW development or DNG export.</footer></main></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
