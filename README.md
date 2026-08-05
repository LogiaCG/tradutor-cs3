# Tradutor CS3 — App Windows (Fase 1)

Empacotamento do Tradutor-CS3 (hoje um HTML único) como app nativo para Windows 11, usando [Tauri](https://tauri.app). Esta é a Fase 1 do plano descrito em `Analise-App-Windows11-CS3-Modding-Suite.md`: só empacotamento, sem editor de cena ainda. O front-end em `src/index.html` é o Tradutor-CS3_6.html atual, copiado sem alterações — toda a lógica de tradução, QA e revisor de coerência já testada continua igual, só rodando numa janela nativa (WebView2) em vez do navegador.

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

## Estrutura

- `src/index.html` — o Tradutor CS3 atual (front-end, sem alterações).
- `src-tauri/` — projeto Rust/Tauri: janela, empacotamento, ícones.
- `src-tauri/tauri.conf.json` — configuração do app (nome, tamanho da janela, alvo de build NSIS).
- `.github/workflows/build-windows.yml` — build automático na nuvem.

## Limitações conhecidas desta Fase 1

- Os ícones em `src-tauri/icons/` são placeholders gerados por script (texto "CS3" sobre o tema escuro/âmbar do app) — troque pelos ícones finais quando tiver a arte definitiva.
- O app ainda carrega React/Babel/SheetJS via CDN (unpkg) em tempo de execução, igual ao HTML original — ou seja, precisa de internet pra abrir, mesmo sem usar nenhum motor de tradução por IA. Vender essas libs localmente (pra funcionar 100% offline, exceto a parte de IA) é uma melhoria natural pra Fase 2.
- Nenhum plugin de arquivo nativo (`fs`/`dialog`) foi adicionado ainda — a Fase 1 mantém o mesmo mecanismo de abrir/baixar arquivo (`<input type=file>` / download via Blob) que já funciona no WebView2 sem precisar de permissão extra. Isso muda na Fase 2, quando o editor de cena precisar ler `.dat`/`.tbl`/`.ops` diretamente do disco.
