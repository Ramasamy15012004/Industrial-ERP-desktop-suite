#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Child};
use std::env;
use std::thread;
use std::time::Duration;
use std::sync::{Arc, Mutex};
use std::path::PathBuf;

use reqwest::blocking::Client;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use tauri_plugin_dialog;
use tauri_plugin_fs;
use tauri_plugin_log::{Builder as LogBuilder, Target, TargetKind, RotationStrategy, TimezoneStrategy};
use log;

fn spawn_process(exe_path: &std::path::PathBuf) -> Option<Child> {
    if !exe_path.exists() {
        log::error!("Executable not found: {:?}", exe_path);
        return None;
    }

    let mut cmd = Command::new(exe_path);

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000);
    }

    match cmd.spawn() {
        Ok(child) => {
            log::info!("Started process: {:?}", exe_path);
            Some(child)
        }
        Err(e) => {
            log::error!("Failed to start {:?}: {}", exe_path, e);
            None
        }
    }
}

fn get_log_dir() -> PathBuf {
    let app_data = env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| env::current_exe().unwrap().parent().unwrap().to_path_buf());
    app_data.join("com.pims.app").join("logs")
}

fn main() {
    let exe_dir = env::current_exe().unwrap().parent().unwrap().to_path_buf();

    let log_dir = get_log_dir();
    std::fs::create_dir_all(&log_dir).ok();

    println!("[PIMS] Application starting...");
    println!("[PIMS] Log directory: {:?}", log_dir);
    println!("[PIMS] Executable directory: {:?}", exe_dir);

    let backend_prod = exe_dir.join("production-backend.exe");
    let docker_prod = exe_dir.join("docker_control.exe");
    
    let backend_dev = exe_dir.join("backend").join("production-backend-x86_64-pc-windows-msvc.exe");
    let docker_dev = exe_dir.join("backend").join("docker_control-x86_64-pc-windows-msvc.exe");

    let backend_exe = if backend_prod.exists() { backend_prod } else { backend_dev };
    let docker_control_exe = if docker_prod.exists() { docker_prod } else { docker_dev };

    let backend_child: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    let docker_child: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));

    let log_plugin = LogBuilder::default()
        .target(Target::new(TargetKind::LogDir {
            file_name: Some("pims".to_string()),
        }))
        .target(Target::new(TargetKind::Stdout))
        .rotation_strategy(RotationStrategy::KeepAll)
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .build();

    let backend_child_clone = backend_child.clone();
    let docker_child_clone = docker_child.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(log_plugin)
        .setup(move |_app| {
            log::info!("PIMS application starting...");
            log::info!("Log directory: {:?}", log_dir);
            log::info!("Executable directory: {:?}", exe_dir);

            if let Some(child) = spawn_process(&backend_exe) {
                *backend_child.lock().unwrap() = Some(child);
                log::info!("Backend process spawned successfully");
            } else {
                log::error!("Failed to spawn backend process");
            }

            if let Some(child) = spawn_process(&docker_control_exe) {
                *docker_child.lock().unwrap() = Some(child);
                log::info!("Docker control process spawned successfully");
            } else {
                log::warn!("Docker control process not found or failed to start");
            }

            thread::sleep(Duration::from_secs(3));
            log::info!("Application ready - UI launching");

            Ok(())
        })
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                log::info!("Shutdown requested - stopping backend services...");

                let _ = Client::new()
                    .post("http://127.0.0.1:8000/shutdown")
                    .timeout(Duration::from_secs(5))
                    .send();

                thread::sleep(Duration::from_secs(2));

                if let Some(mut child) = backend_child_clone.lock().unwrap().take() {
                    let _ = child.kill();
                    let _ = child.wait();
                    log::info!("Backend process stopped");
                }

                if let Some(mut child) = docker_child_clone.lock().unwrap().take() {
                    let _ = child.kill();
                    let _ = child.wait();
                    log::info!("Docker control process stopped");
                }

                log::info!("Application shutdown complete");
                std::process::exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error running tauri app");
}