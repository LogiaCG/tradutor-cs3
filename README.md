# Tradutor CS3 — App Windows (Fase 1 + Fase 2: Editor de Cenas)

Empacotamento do Tradutor-CS3 (hoje um HTML único) como app nativo para Windows 11, usando [Tauri](https://tauri.app), conforme o plano em `Analise-App-Windows11-CS3-Modding-Suite.md`.

- **Fase 1** (empacotamento): `src/index.html` é o Tradutor-CS3_6.html atual — toda a lógica de tradução, QA e revisor de coerência já testada continua igual, só rodando numa janela nativa (WebView2) em vez do navegador.
- **Fase 2** (Editor de Cenas): nova aba "Editor de Cenas" no próprio app. Abre o MESMO `.xlsx` já decompilado pelo SenScriptsDecompiler (o que já é usado hoje pra tradução) e mostra cada instrução de cada função com um formulário tipado (byte/short/int/float/string/diálogo) em vez de célula de planilha crua — os campos que são fórmula/estrutura (`fill`, `pointer`, os marcadores `Start`/`End`) ficam automaticamente só-leitura, nunca editáveis. Dentro do app Windows (não no navegador comum), dá pra decompilar um `.dat` direto e recompilar de volta sem sair da tela, chamando o `SenScriptsDecompiler.exe` do usuário nos bastidores.

## Aviso importante sobre esta entrega

Este projeto foi montado à mão num ambiente que **não tem Rust instalado e não tem acesso liberado a crates.io/registry do npm/rustup.rs** (bloqueio de rede do sandbox). Ou seja: os arquivos foram escritos manualmente seguindo o formato correto do Tauri v2, mas **nunca foram compilados nem testados de ponta a ponta** aqui. O primeiro build (local ou via CI) é a validação real — se der erro de compilação, me mande a mensagem de erro que eu corrijo.

## Como gerar o .exe

### Opção A — GitHub Actions (recomendado, não precisa instalar nada)

1. Suba esta pasta pra um repositório no GitHub.
2. Vá em Actions → "Build instalador Windows" → **Run workflow** (ou apenas dê push na `main`, o workflow já dispara sozinho).
3. Quando terminar, o instalador (`.exe` NSIS) fica disponível como *asset* de um Release rascunho (draft) criado automaticamente.

O runner do GitHub instala Rust e Node do zero a cada build, então o processo demora uns 10-15 minutos — normal.

### Opção B — Build local (precisa de Windows)

Pré-requisitos: [Rust](https://rustup.rs) + [Node.js](https://nodejs.org) + [Visual Studio Build Tools](https://tauri.app/start/prerequisites/) (o instalador do Rust já avisa se faltar).

```powershell
npm install
npm run tauri build
```

O instalador sai em `src-tauri/target/release/bundle/nsis/`.

Pra testar sem gerar instalador (janela abre na hora, com hot-reload):

```powershell
npm run tauri dev
```

## Como usar o Editor de Cenas

1. Abra um `.xlsx` normalmente (arrastando ou clicando), do mesmo jeito que já faz pra traduzir — precisa já estar decompilado pelo SenScriptsDecompiler (por fora, com o `converter_em_lote.bat`, ou de dentro do app — ver abaixo).
2. Clique em **"Editor de Cenas"** na barra do arquivo. Escolha uma função na lista à esquerda (dá pra buscar por nome) pra ver as instruções dela.
3. Edite os campos — os cinza/apagados (`fill`, `pointer`, `Start`/`End`) são estrutura/fórmula e não são editáveis de propósito, pra não arriscar corromper o arquivo num formato ainda não documentado por completo.
4. **"Baixar .xlsx com as edições"** sempre funciona (navegador ou app). **"Recompilar para .dat"** e **"Abrir .dat…"** só aparecem dentro do app Windows, e só ficam ativos depois de configurar a pasta do SenScriptsDecompiler em Configurações (a mesma pasta onde já ficam o `.exe`, as `.dll` do Qt e o `config.ini` — o lugar de onde o `converter_em_lote.bat` já roda hoje).

## Estrutura

- `src/index.html` — o Tradutor CS3 atual, com a aba "Editor de Cenas" adicionada (front-end).
- `src-tauri/` — projeto Rust/Tauri: janela, empacotamento, ícones, comandos nativos.
- `src-tauri/src/main.rs` — os 3 comandos da Fase 2: `decompile_dat`, `recompile_xlsx`, `read_file_bytes`. Todos só chamam o `SenScriptsDecompiler.exe` do jeito exato que o `converter_em_lote.bat` do usuário já chama (`<exe> <jogo> <arquivo> <pasta_saida>`) e leem/escrevem bytes — a lógica de entender o FORMATO do `.xlsx` (funções/instruções/parâmetros) é toda em JS (`parseSceneSheet` e afins, mirror de `core.js`, testada em Node contra um arquivo de cena real).
- `src-tauri/tauri.conf.json` — configuração do app (nome, tamanho da janela, alvo de build NSIS, `withGlobalTauri` pra expor `window.__TAURI__` sem precisar de bundler).
- `src-tauri/capabilities/default.json` — permissões: `core:default` (comandos próprios) + `dialog:default` (seletor nativo de arquivo/pasta, necessário pra escolher a pasta do decompilador e o `.dat`).
- `.github/workflows/build-windows.yml` — build automático na nuvem.

## Limitações conhecidas

- Os ícones em `src-tauri/icons/` são placeholders gerados por script (texto "CS3" sobre o tema escuro/âmbar do app) — troque pelos ícones finais quando tiver a arte definitiva.
- O app ainda carrega React/Babel/SheetJS via CDN (unpkg) em tempo de execução, igual ao HTML original — ou seja, precisa de internet pra abrir, mesmo sem usar nenhum motor de tradução por IA. Vender essas libs localmente é uma melhoria natural futura.
- **Editor de Cenas — campos cobertos:** o parser é genérico (lê o tipo de cada parâmetro a partir do PRÓPRIO cabeçalho da instrução na planilha, não de uma tabela fixa por OP code), então funciona pra qualquer OP code, documentado ou não. Só ~13 OP codes (2, 5, 22, 29, 36, 38, 39, 41, 47, 54, 55, 60, 172) ganham um nome amigável (do PDF de documentação) — os outros aparecem só como "OP <número>", editáveis igual, sem rótulo. OP 41 e 54 são multi-variante (formato muda pelo primeiro parâmetro) — confirmado com dados reais.
- **Editor de Cenas — comandos Rust não testados:** escritos e revisados à mão, sem compilar (mesma limitação de rede/toolchain da Fase 1). A lógica de parsing do `.xlsx` (a parte que decide o que é seguro editar) foi validada em Node contra um recorte real do arquivo de cena que o usuário mandou (`a0000.xlsx`) — 282 testes automatizados, incluindo o caso real de branch/pointer/diálogo. A parte Rust (achar o arquivo novo gerado pelo decompilador comparando a pasta antes/depois, escrever o `.xlsx` temporário, chamar o `.exe`) só será validada no primeiro build de verdade.
- **Nomes de instalação do decompilador:** `run_decompiler` espera `SenScriptsDecompiler.exe` direto dentro da pasta configurada (mesma estrutura de pastas do `converter_em_lote.bat` do usuário). Se a instalação dele for diferente disso, avisa que dá pra ajustar.
