//! Plain filesystem operations used by the Tauri commands. Kept free of Tauri
//! types so they can be unit-tested with a bare `rustc --test src/fsops.rs`.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub modified: Option<u64>,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

pub fn list(path: &str) -> Result<Vec<DirEntry>, String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(path).map_err(err)? {
        let entry = entry.map_err(err)?;
        let meta = entry.metadata().map_err(err)?;
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64);
        out.push(DirEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_dir: meta.is_dir(),
            size: if meta.is_file() { Some(meta.len()) } else { None },
            modified,
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// Reads a text file, tolerating a UTF-8 BOM (Notepad / OneDrive exports).
pub fn read_text(path: &str) -> Result<String, String> {
    let bytes = fs::read(path).map_err(err)?;
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF][..]).unwrap_or(&bytes);
    Ok(String::from_utf8_lossy(bytes).into_owned())
}

/// Atomic write: write to a temp file beside the target, then rename over it,
/// so a sync client never uploads a half-written record.
pub fn write_text(path: &str, contents: &str) -> Result<(), String> {
    let target = PathBuf::from(path);
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(err)?;
        }
    }
    let mut tmp_name = target
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "file".into());
    tmp_name.push_str(".gallery-tmp");
    let tmp = target.with_file_name(tmp_name);
    fs::write(&tmp, contents.as_bytes()).map_err(err)?;
    match fs::rename(&tmp, &target) {
        Ok(()) => Ok(()),
        Err(_) => {
            // Windows can refuse to rename over a file another process holds open;
            // fall back to a direct write and clean up.
            let r = fs::write(&target, contents.as_bytes()).map_err(err);
            let _ = fs::remove_file(&tmp);
            r
        }
    }
}

pub fn exists(path: &str) -> bool {
    Path::new(path).exists()
}

pub fn mkdir_all(path: &str) -> Result<(), String> {
    fs::create_dir_all(path).map_err(err)
}

pub fn remove(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if p.is_dir() {
        return Err("refusing to remove a directory".into());
    }
    fs::remove_file(p).map_err(err)
}

pub fn rename(from: &str, to: &str) -> Result<(), String> {
    if let Some(parent) = Path::new(to).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(err)?;
        }
    }
    fs::rename(from, to).map_err(err)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("gallery-fsops-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn write_read_list_rename_remove() {
        let d = tmpdir("basic");
        let f = d.join("craft").join("x.craft.yaml");
        let fs_ = f.to_str().unwrap();
        write_text(fs_, "name: X\n").unwrap();
        assert_eq!(read_text(fs_).unwrap(), "name: X\n");
        // overwrite atomically, no temp file left behind
        write_text(fs_, "name: Y\n").unwrap();
        assert_eq!(read_text(fs_).unwrap(), "name: Y\n");
        let names: Vec<String> = list(d.join("craft").to_str().unwrap()).unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, vec!["x.craft.yaml"]);
        let g = d.join("craft").join("y.craft.yaml");
        rename(fs_, g.to_str().unwrap()).unwrap();
        assert!(!exists(fs_));
        assert!(exists(g.to_str().unwrap()));
        remove(g.to_str().unwrap()).unwrap();
        assert!(!exists(g.to_str().unwrap()));
        assert!(remove(d.to_str().unwrap()).is_err());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn strips_bom() {
        let d = tmpdir("bom");
        let f = d.join("n.opml");
        fs::write(&f, b"\xEF\xBB\xBF<opml/>").unwrap();
        assert_eq!(read_text(f.to_str().unwrap()).unwrap(), "<opml/>");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn list_marks_dirs() {
        let d = tmpdir("dirs");
        mkdir_all(d.join("sub").to_str().unwrap()).unwrap();
        write_text(d.join("a.txt").to_str().unwrap(), "a").unwrap();
        let es = list(d.to_str().unwrap()).unwrap();
        assert_eq!(es.len(), 2);
        assert!(!es[0].is_dir && es[0].size == Some(1));
        assert!(es[1].is_dir && es[1].name == "sub");
        let _ = fs::remove_dir_all(&d);
    }
}
