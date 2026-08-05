// Fase 2 do app Windows do Tradutor CS3: editor de cena. Os comandos abaixo
// só fazem uma coisa — chamar o SenScriptsDecompiler.exe do jeito exato que
// o converter_em_lote.bat do usuário já chama ("<exe> <jogo> <arquivo>
// <pasta_saida>") — e ler/escrever os bytes que a tela em JS precisa. Toda a
// lógica de entender o FORMATO do .xlsx (funções, instruções, parâmetros)
// fica do lado JS/core.js, testada em Node; aqui é só encanamento de
// processo e arquivo.
//
// IMPORTANTE: este arquivo foi escrito à mão num ambiente sem Rust instalado
// e sem acesso à internet liberado (não dá pra baixar as crates do
// crates.io) — não foi compilado nem testado de ponta a ponta aqui. O
// primeiro `cargo tauri build` (local ou via GitHub Actions) é a validação
// real. Ver README.md pra mais detalhes.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::SystemTime;

// Lista os nomes de arquivo (não-diretório) presentes numa pasta agora. Usado
// pra comparar "antes" e "depois" de rodar o decompilador e achar o arquivo
// novo que ele gerou, em vez de tentar adivinhar o nome de saída (o
// converter_em_lote.bat não documenta uma regra fixa de nome, então não
// arriscamos inventar uma).
fn snapshot_filenames(dir: &Path) -> HashSet<String> {
    let mut set = HashSet::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    if let Some(name) = entry.file_name().to_str() {
                        set.insert(name.to_string());
                    }
                }
            }
        }
    }
    set
}

// Roda o SenScriptsDecompiler.exe exatamente como o converter_em_lote.bat do
// usuário já roda: `<exe_dir>\SenScriptsDecompiler.exe "<game>" "<input>"
// "<output_dir>"`. Detecta automaticamente se decompilou (.dat -> .xlsx) ou
// recompilou (.xlsx -> .dat) pela extensão do arquivo de entrada — o próprio
// .exe já faz essa escolha sozinho, aqui só repassamos.
fn run_decompiler(exe_dir: &str, game: &str, input_path: &str, output_dir: &Path) -> Result<String, String> {
    let exe_path = Path::new(exe_dir).join("SenScriptsDecompiler.exe");
    if !exe_path.exists() {
        return Err(format!(
            "SenScriptsDecompiler.exe não encontrado em {} — confira a pasta configurada nas Configurações do app.",
            exe_dir
        ));
    }

    std::fs::create_dir_all(output_dir)
        .map_err(|e| format!("não consegui criar a pasta de saída {}: {}", output_dir.display(), e))?;

    let before = snapshot_filenames(output_dir);

    let output = Command::new(&exe_path)
        .arg(game)
        .arg(input_path)
        .arg(output_dir.as_os_str())
        .output()
        .map_err(|e| format!("falha ao executar {}: {}", exe_path.display(), e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "SenScriptsDecompiler.exe terminou com erro (código {:?}).\nstdout: {}\nstderr: {}",
            output.status.code(),
            stdout.trim(),
            stderr.trim()
        ));
    }

    let after = snapshot_filenames(output_dir);
    let mut novos: Vec<String> = after.difference(&before).cloned().collect();

    if novos.is_empty() {
        return Err(
            "o SenScriptsDecompiler.exe rodou sem erro, mas nenhum arquivo novo apareceu na pasta de saída — pode ter falhado silenciosamente. Confira o arquivo de entrada.".to_string(),
        );
    }

    // Se mais de um arquivo novo apareceu (não deveria, mas por segurança),
    // pega o modificado mais recentemente.
    novos.sort_by_key(|name| {
        std::fs::metadata(output_dir.join(name))
            .and_then(|m| m.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH)
    });
    let escolhido = novos.pop().unwrap();
    Ok(output_dir.join(escolhido).to_string_lossy().to_string())
}

#[tauri::command]
fn decompile_dat(exe_dir: String, game: String, dat_path: String) -> Result<String, String> {
    let output_dir = Path::new(&exe_dir).join("output");
    run_decompiler(&exe_dir, &game, &dat_path, &output_dir)
}

#[tauri::command]
fn recompile_xlsx(
    exe_dir: String,
    game: String,
    xlsx_bytes: Vec<u8>,
    suggested_name: String,
) -> Result<String, String> {
    let input_dir = Path::new(&exe_dir).join("input");
    std::fs::create_dir_all(&input_dir)
        .map_err(|e| format!("não consegui criar a pasta de entrada {}: {}", input_dir.display(), e))?;

    // nome de arquivo seguro (sem separador de pasta) — suggested_name já
    // vem só com o nome (ver baseName() no front-end), mas não confiamos
    // cegamente em entrada vinda do JS.
    let safe_name: String = suggested_name
        .chars()
        .map(|c| if c == '/' || c == '\\' { '-' } else { c })
        .collect();
    let input_path = input_dir.join(if safe_name.is_empty() { "cena_editada.xlsx".to_string() } else { safe_name });

    std::fs::write(&input_path, &xlsx_bytes)
        .map_err(|e| format!("não consegui gravar o .xlsx temporário em {}: {}", input_path.display(), e))?;

    let output_dir = Path::new(&exe_dir).join("output");
    run_decompiler(&exe_dir, &game, &input_path.to_string_lossy(), &output_dir)
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("não consegui ler {}: {}", path, e))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            decompile_dat,
            recompile_xlsx,
            read_file_bytes
        ])
        .run(tauri::generate_context!())
        .expect("erro ao rodar o app Tauri");
}
