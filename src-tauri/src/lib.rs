//! Argaia desktop shell. The app itself is the web build in `dist/`; card text and images are
//! loaded by the web page from github.com/kbiben29-hue/ashes-cards.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Argaia");
}
