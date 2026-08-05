// Fase 1 do app Windows do Tradutor CS3: apenas empacota o front-end existente
// (src/index.html) numa janela nativa via WebView2. Nenhum comando Rust
// customizado ainda — isso entra na Fase 2 (editor de cena), quando o app vai
// precisar ler/escrever arquivos .dat/.tbl/.ops fora da sandbox do navegador.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("erro ao rodar o app Tauri");
}
