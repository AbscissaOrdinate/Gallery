//! Gallery desktop shell.
//!
//! The whole application lives in the web frontend; this crate only exposes a
//! handful of filesystem commands so the vault can be any folder on disk
//! (OneDrive, Google Drive, a USB stick) without plugin scope configuration,
//! plus a tiny settings store in the OS config directory.

mod fsops;

use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
fn fs_list(path: String) -> Result<Vec<fsops::DirEntry>, String> {
    fsops::list(&path)
}

#[tauri::command]
fn fs_read_text(path: String) -> Result<String, String> {
    fsops::read_text(&path)
}

#[tauri::command]
fn fs_write_text(path: String, contents: String) -> Result<(), String> {
    fsops::write_text(&path, &contents)
}

#[tauri::command]
fn fs_exists(path: String) -> bool {
    fsops::exists(&path)
}

#[tauri::command]
fn fs_mkdir_all(path: String) -> Result<(), String> {
    fsops::mkdir_all(&path)
}

#[tauri::command]
fn fs_remove(path: String) -> Result<(), String> {
    fsops::remove(&path)
}

#[tauri::command]
fn fs_rename(from: String, to: String) -> Result<(), String> {
    fsops::rename(&from, &to)
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

#[tauri::command]
fn settings_read(app: tauri::AppHandle) -> Result<String, String> {
    let p = settings_path(&app)?;
    if !p.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(p).map_err(|e| e.to_string())
}

#[tauri::command]
fn settings_write(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    fs::write(settings_path(&app)?, contents).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            fs_list,
            fs_read_text,
            fs_write_text,
            fs_exists,
            fs_mkdir_all,
            fs_remove,
            fs_rename,
            settings_read,
            settings_write
        ])
        .run(tauri::generate_context!())
        .expect("error while running Gallery");
}
