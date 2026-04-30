use std::{fs, path::Path};

use tauri::Manager;

const DATABASE_FILE_NAME: &str = "focusapp.db";

fn copy_sidecar_file(source_db: &Path, target_db: &Path, suffix: &str) -> Result<(), String> {
    let Some(source_name) = source_db.file_name() else {
        return Ok(());
    };
    let Some(target_name) = target_db.file_name() else {
        return Ok(());
    };

    let source = source_db.with_file_name(format!("{}{}", source_name.to_string_lossy(), suffix));
    let target = target_db.with_file_name(format!("{}{}", target_name.to_string_lossy(), suffix));

    if source.exists() {
        fs::copy(&source, &target).map_err(|error| {
            format!(
                "failed to copy legacy SQLite sidecar {} to {}: {error}",
                source.display(),
                target.display()
            )
        })?;
    }

    Ok(())
}

#[tauri::command]
fn focusapp_database_url(app: tauri::AppHandle) -> Result<String, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("failed to create app data directory: {error}"))?;

    let db_path = data_dir.join(DATABASE_FILE_NAME);

    if !db_path.exists() {
        let config_dir = app
            .path()
            .app_config_dir()
            .map_err(|error| format!("failed to resolve app config directory: {error}"))?;
        let legacy_db_path = config_dir.join(DATABASE_FILE_NAME);

        if legacy_db_path.exists() {
            fs::copy(&legacy_db_path, &db_path).map_err(|error| {
                format!(
                    "failed to copy legacy SQLite database {} to {}: {error}",
                    legacy_db_path.display(),
                    db_path.display()
                )
            })?;
            copy_sidecar_file(&legacy_db_path, &db_path, "-wal")?;
            copy_sidecar_file(&legacy_db_path, &db_path, "-shm")?;
        }
    }

    Ok(format!("sqlite:{}", db_path.to_string_lossy()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![focusapp_database_url])
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
