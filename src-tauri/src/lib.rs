use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{cmp::Ordering, collections::HashSet, path::Path, process::Command};
use walkdir::WalkDir;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Photo { path: String, name: String, camera: String, taken_at: String, exposure_time: Option<f64>, aperture: Option<f64>, iso: Option<f64>, exposure_bias: Option<f64>, focal_length: Option<f64>, ev100: Option<f64> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Group { id: usize, photos: Vec<Photo>, confidence: u8, exposure_span: f64, reason: String }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanResult { photo_count: usize, groups: Vec<Group>, unmatched: Vec<Photo> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanSettings { max_gap_seconds: u32, bracket_size: usize, min_span_ev: f64 }

fn number(v: &Value, key: &str) -> Option<f64> {
    match v.get(key)? { Value::Number(n) => n.as_f64(), Value::String(s) => {
        let t=s.split_whitespace().next()?;
        if let Some((a,b))=t.split_once('/') { let den=b.parse::<f64>().ok()?; if den==0.0 {None} else {Some(a.parse::<f64>().ok()?/den)} } else {t.parse().ok()}
    }, _ => None }
}
fn string(v: &Value,key: &str)->String {v.get(key).and_then(Value::as_str).unwrap_or("").to_owned()}
fn timestamp(s:&str)->Option<i64> {
    let normalized = s.get(..19)?;
    NaiveDateTime::parse_from_str(normalized,"%Y:%m:%d %H:%M:%S").ok().map(|d|d.and_utc().timestamp())
}
fn is_supported(path:&Path)->bool {
    let ext=path.extension().and_then(|e|e.to_str()).unwrap_or("").to_ascii_lowercase();
    matches!(ext.as_str(),"dng"|"cr2"|"cr3"|"nef"|"arw"|"raf"|"orf"|"rw2"|"jpg"|"jpeg"|"tif"|"tiff")
}
fn photos_from_exiftool(paths:&[String])->Result<Vec<Photo>,String> {
    let mut all = Vec::new();
    for chunk in paths.chunks(100) {
        let out=Command::new("exiftool").args(["-json","-n","-DateTimeOriginal","-Make","-Model","-SerialNumber","-ExposureTime","-FNumber","-ISO","-ExposureCompensation","-FocalLength"]).args(chunk).output().map_err(|e|format!("ExifTool not available: {e}. Install ExifTool and add it to PATH."))?;
        if !out.status.success() {return Err(format!("ExifTool exited with status {}: {}",out.status,String::from_utf8_lossy(&out.stderr)));}
        let records:Vec<Value>=serde_json::from_slice(&out.stdout).map_err(|e|e.to_string())?;
        for v in records {
            let path=string(&v,"SourceFile"); let t=number(&v,"ExposureTime"); let a=number(&v,"FNumber"); let iso=number(&v,"ISO");
            let ev100=match (t,a,iso) { (Some(t),Some(a),Some(iso)) if t>0.0&&a>0.0&&iso>0.0 => Some((a*a/t).log2()-(iso/100.0).log2()),_=>None};
            let name=Path::new(&path).file_name().and_then(|s|s.to_str()).unwrap_or("").to_string();
            all.push(Photo {path,name,camera: format!("{} {} {}",string(&v,"Make"),string(&v,"Model"),string(&v,"SerialNumber")).trim().to_string(),taken_at:string(&v,"DateTimeOriginal"),exposure_time:t,aperture:a,iso,exposure_bias:number(&v,"ExposureCompensation"),focal_length:number(&v,"FocalLength"),ev100});
        }
    }
    Ok(all)
}
fn grouping(mut photos:Vec<Photo>, settings:ScanSettings)->ScanResult {
    let photo_count=photos.len();
    photos.sort_by(|a,b|a.camera.cmp(&b.camera).then_with(||a.taken_at.cmp(&b.taken_at)).then_with(||a.path.cmp(&b.path)));
    let size=settings.bracket_size.clamp(3,9); let mut used=HashSet::new();let mut groups=Vec::new();
    for start in 0..photos.len() {
        if used.contains(&start) {continue;}
        let first=&photos[start];let Some(start_t)=timestamp(&first.taken_at) else {continue};
        let mut candidates=vec![start];
        for j in start+1..photos.len() {
            if candidates.len()==size {break;}
            if used.contains(&j) {continue;}
            let other=&photos[j];if other.camera!=first.camera {break;}
            let Some(t)=timestamp(&other.taken_at) else {continue};
            if t-start_t>settings.max_gap_seconds as i64 {break;}
            if (first.aperture.unwrap_or(0.0)-other.aperture.unwrap_or(0.0)).abs()>0.15 {continue;}
            if (first.focal_length.unwrap_or(0.0)-other.focal_length.unwrap_or(0.0)).abs()>1.0 {continue;}
            candidates.push(j);
        }
        if candidates.len()!=size {continue;}
        let mut evs:Vec<f64>=candidates.iter().filter_map(|i|photos[*i].ev100).collect();
        if evs.len()!=size {continue;}
        evs.sort_by(|a,b|a.partial_cmp(b).unwrap_or(Ordering::Equal));
        let span=evs[size-1]-evs[0];
        if span<settings.min_span_ev {continue;}
        let gaps:Vec<f64>=evs.windows(2).map(|w|w[1]-w[0]).collect();
        let avg=span/(size-1) as f64;
        let consistent=gaps.iter().all(|g| (*g-avg).abs()<=0.55 && *g>0.25);
        if !consistent {continue;}
        let confidence=if first.camera.is_empty() {75} else {90};
        groups.push(Group{id:groups.len()+1,photos:candidates.iter().map(|i|photos[*i].clone()).collect(),confidence,exposure_span:(span*10.0).round()/10.0,reason:"Consistent exposure spacing, camera and capture time".into()});
        used.extend(candidates);
    }
    let unmatched=photos.into_iter().enumerate().filter_map(|(i,p)|if used.contains(&i){None}else{Some(p)}).collect();
    ScanResult{photo_count,groups,unmatched}
}
#[tauri::command]
fn scan_folder(folder:String,settings:ScanSettings)->Result<ScanResult,String>{
    let root=Path::new(&folder);
    if !root.is_dir(){return Err("Selected path is not a directory".into());}
    let paths:Vec<String>=WalkDir::new(root).max_depth(8).follow_links(false).into_iter().filter_map(Result::ok).filter(|e|e.file_type().is_file()&&is_supported(e.path())).map(|e|e.path().to_string_lossy().to_string()).collect();
    if paths.is_empty(){return Ok(ScanResult{photo_count:0,groups:vec![],unmatched:vec![]});}
    Ok(grouping(photos_from_exiftool(&paths)?,settings))
}
pub fn run(){tauri::Builder::default().plugin(tauri_plugin_dialog::init()).invoke_handler(tauri::generate_handler![scan_folder]).run(tauri::generate_context!()).expect("error while running Tauri application");}
