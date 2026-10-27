use serde::Serialize;
use serde_json::Value;
use std::{fs, path::{Path, PathBuf}, process::Command, sync::Mutex};
use tauri::State;
use walkdir::WalkDir;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Photo { path: String, name: String, camera: String, taken_at: String, exposure_time: Option<f64>, aperture: Option<f64>, iso: Option<f64>, exposure_bias: Option<f64>, focal_length: Option<f64>, ev100: Option<f64>, lens_model: Option<String>, width: Option<u32>, height: Option<u32> }
fn number(v: &Value, key: &str) -> Option<f64> {
    match v.get(key)? { Value::Number(n) => n.as_f64(), Value::String(s) => {
        let t=s.split_whitespace().next()?;
        if let Some((a,b))=t.split_once('/') { let den=b.parse::<f64>().ok()?; if den==0.0 {None} else {Some(a.parse::<f64>().ok()?/den)} } else {t.parse().ok()}
    }, _ => None }
}
fn string(v: &Value,key: &str)->String {v.get(key).and_then(Value::as_str).unwrap_or("").to_owned()}
fn is_supported(path:&Path)->bool {
    let ext=path.extension().and_then(|e|e.to_str()).unwrap_or("").to_ascii_lowercase();
    matches!(ext.as_str(),"dng"|"cr2"|"cr3"|"nef"|"arw"|"raf"|"orf"|"rw2"|"jpg"|"jpeg"|"tif"|"tiff")
}
fn photos_from_exiftool(paths:&[String])->Result<Vec<Photo>,String> {
    let mut all = Vec::new();
    for chunk in paths.chunks(100) {
        let out=Command::new("exiftool").args(["-json","-n","-DateTimeOriginal","-Make","-Model","-SerialNumber","-ExposureTime","-FNumber","-ISO","-ExposureCompensation","-FocalLength","-LensModel","-ImageWidth","-ImageHeight"]).args(chunk).output().map_err(|e|format!("ExifTool not available: {e}. Install ExifTool and add it to PATH."))?;
        if !out.status.success() {return Err(format!("ExifTool exited with status {}: {}",out.status,String::from_utf8_lossy(&out.stderr)));}
        let records:Vec<Value>=serde_json::from_slice(&out.stdout).map_err(|e|e.to_string())?;
        for v in records {
            let path=string(&v,"SourceFile"); let t=number(&v,"ExposureTime"); let a=number(&v,"FNumber"); let iso=number(&v,"ISO");
            let ev100=match (t,a,iso) { (Some(t),Some(a),Some(iso)) if t>0.0&&a>0.0&&iso>0.0 => Some((a*a/t).log2()-(iso/100.0).log2()),_=>None};
            let name=Path::new(&path).file_name().and_then(|s|s.to_str()).unwrap_or("").to_string();
            all.push(Photo {path,name,camera: format!("{} {} {}",string(&v,"Make"),string(&v,"Model"),string(&v,"SerialNumber")).trim().to_string(),taken_at:string(&v,"DateTimeOriginal"),exposure_time:t,aperture:a,iso,exposure_bias:number(&v,"ExposureCompensation"),focal_length:number(&v,"FocalLength"),ev100,
                lens_model: v.get("LensModel").and_then(Value::as_str).map(str::to_owned),
                width:number(&v,"ImageWidth").map(|x|x as u32),
                height:number(&v,"ImageHeight").map(|x|x as u32)});
        }
    }
    Ok(all)
}

#[derive(Default)]
struct AppState {
    // Only files inside the folder selected and scanned by the user may be read.
    selected_root: Mutex<Option<PathBuf>>,
}

#[derive(Serialize)]
struct RasterData {
    bytes: Vec<u8>,
    mime: &'static str,
}

#[tauri::command]
fn scan_folder(folder: String, state: State<'_, AppState>) -> Result<Vec<Photo>, String> {
    let root = Path::new(&folder)
        .canonicalize()
        .map_err(|e| format!("Cannot access selected folder: {e}"))?;
    if !root.is_dir() {
        return Err("Selected path is not a directory".into());
    }
    let paths: Vec<String> = WalkDir::new(&root)
        .max_depth(8)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file() && is_supported(entry.path()))
        .map(|entry| entry.path().to_string_lossy().to_string())
        .collect();

    // Metadata parsing happens on the native side. Both targets use the same
    // TypeScript groupPhotos algorithm after this command returns.
    let photos = if paths.is_empty() {
        Vec::new()
    } else {
        photos_from_exiftool(&paths)?
    };
    *state.selected_root.lock().map_err(|_| "Folder state lock failed")? = Some(root);
    Ok(photos)
}

#[tauri::command]
fn read_raster_photo(path: String, state: State<'_, AppState>) -> Result<RasterData, String> {
    let root = state.selected_root.lock()
        .map_err(|_| "Folder state lock failed")?
        .clone()
        .ok_or("Import and scan a folder before reading image files")?;

    let file = Path::new(&path)
        .canonicalize()
        .map_err(|e| format!("Cannot access image: {e}"))?;
    if !file.starts_with(&root) || !file.is_file() {
        return Err("Image is outside the selected photo folder".into());
    }

    let ext = file.extension().and_then(|v| v.to_str())
        .unwrap_or("").to_ascii_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        _ => return Err("Native preview supports JPEG, PNG and WebP only".into()),
    };
    const MAX_IMAGE_BYTES: u64 = 64 * 1024 * 1024;
    if fs::metadata(&file).map_err(|e| e.to_string())?.len() > MAX_IMAGE_BYTES {
        return Err("Image exceeds the 64 MiB desktop preview limit".into());
    }
    Ok(RasterData {
        bytes: fs::read(&file).map_err(|e| format!("Cannot read image: {e}"))?,
        mime,
    })
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![scan_folder, read_raster_photo])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
