# Tradutor CS3 — App Windows (Fase 1 + Fase 2: Editor de Cenas + Fase 3: ID/OPS/TBL)

Empacotamento do Tradutor-CS3 (hoje um HTML único) como app nativo para Windows 11, usando [Tauri](https://tauri.app), conforme o plano em `Analise-App-Windows11-CS3-Modding-Suite.md`.

- **Fase 1** (empacotamento): `src/index.html` é o Tradutor-CS3_6.html atual — toda a lógica de tradução, QA e revisor de coerência já testada continua igual, só rodando numa janela nativa (WebView2) em vez do navegador.
- **Fase 2** (Editor de Cenas): nova aba "Editor de Cenas" no próprio app. Abre o MESMO `.xlsx` já decompilado pelo SenScriptsDecompiler (o que já é usado hoje pra tradução) e mostra cada instrução de cada função com um formulário tipado (byte/short/int/float/string/diálogo) em vez de célula de planilha crua — os campos que são fórmula/estrutura (`fill`, `pointer`, os marcadores `Start`/`End`) ficam automaticamente só-leitura, nunca editáveis. Dentro do app Windows (não no navegador comum), dá pra decompilar um `.dat` direto e recompilar de volta sem sair da tela, chamando o `SenScriptsDecompiler.exe` do usuário nos bastidores.
- **Fase 3** (ID de arquivo novo + Editor de OPS + Editores de Tabela): seis novas abas, todas independentes de qualquer arquivo aberto.
  - **"ID de arquivo novo"**: calculadora do ID hexadecimal de um script novo (`base do prefixo + número × 0xA`), fórmula tirada do PDF de documentação e conferida à mão contra o exemplo dele (`m0292` → `0x000625E8`). Cobre os 9 prefixos documentados: a, c, t, r, m, e, f, v, i.
  - **"Editor de OPS"**: edita as tags `<EntryBox .../>` de um arquivo `.ops` (`data/ops/pc/*.ops`, XML puro — os pontos de entrada/gatilho no mapa: posição, distância, próximo mapa, etc.). Dentro do app Windows dá pra abrir o `.ops` direto (seletor nativo); no navegador ou sem o seletor, dá pra colar o XML manualmente. A edição é sempre cirúrgica — só troca o valor do atributo escolhido, nunca reconstrói a linha, preservando 100% do resto do arquivo.
  - **"Itens (.tbl)"**: edita nome e descrição de itens dentro de um `.tbl` binário (ex: `t_item_en.tbl`). Reverse engenharia feita em cima do arquivo real que o usuário mandou — cobertura de ~89% dos registros, ver seção própria abaixo.
  - **"Nomes (.tbl)"**: edita o nome de exibição de personagens (ex: `t_name.tbl` — inclui variantes de traje, tipo "Rean: Swimsuit"). Reconhece **100%** dos registros do arquivo real testado (1581 de 1581).
  - **"Lugares (.tbl)"**: edita o título de lugares/capítulos (ex: `t_place.tbl` — "Chapter 1 - Reunion", nomes de rua/distrito, etc.). Reconhece **100%** dos registros do arquivo real testado (474 de 474).
- **Cards de tradução (fluxo principal)**: cada card de diálogo agora mostra um selo com o OP Code de origem e o que ele representa (ex. `OP39: Diálogo — nome do interlocutor`). OP29 (nome de personagem) e OP41 (menu/ARCUS) foram investigados e ficaram de fora da extração — ver seção própria abaixo.

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

## Fase 3 — Editor de Tabelas (.tbl): como foi feito e o que cobre

O roteiro original da Fase 3 previa três peças: calculadora de ID, editor de OPS e editor de TBL (`data/text/*.tbl`). As duas primeiras não precisavam de arquivo real (fórmula documentada / XML com exemplo no PDF). O editor de TBL era diferente: os arquivos TBL são binários, sem spec byte a byte completa em lugar nenhum (o próprio PDF de documentação, mesmo detalhado, só mostra prints parciais de editor hexadecimal e avisa que "cada TBL pode ser formatado diferente"). Por isso ele ficou de fora da primeira entrega da Fase 3, até o usuário mandar um `t_item_en.tbl` real.

Com o arquivo em mãos, a reverse engenharia foi feita direto em cima dos bytes (script Python fora do app, analisando hex dump e testando hipóteses contra o arquivo inteiro antes de escrever qualquer parser em JS — mesma disciplina da Fase 2 com o `a0000.xlsx`). Estrutura encontrada por registro de item:

```
... 0xFF 0xFF <flag em MAIÚSCULAS, 1-15 chars><NUL>
    <127 bytes de dados numéricos — NUNCA tocados, formato não decifrado>
    <nome em UTF-8><NUL>
    <descrição em UTF-8, às vezes com \n embutido><NUL>
    <padding de zeros até o próximo registro>
```

O parser (`parseItemTable` em `core.js`) só aceita um registro como editável quando nome E descrição decodificam como UTF-8 limpo (sem caractere de controle além de `\n`) — qualquer coisa que não bate esse padrão fica de fora, nunca é tocada. Rodado contra o arquivo inteiro que o usuário mandou (311.891 bytes, 937 itens declarados no cabeçalho): **834 reconhecidos (~89%), zero falsos positivos** (nenhum candidato que bateu o começo do padrão falhou na validação de texto). Os ~11% restantes provavelmente pertencem a uma seção com layout de bloco numérico diferente — o cabeçalho do arquivo declara pelo menos 3 seções internas ("item"=937, "item_q"=307, "item"=288 de novo), não totalmente decifradas ainda.

A edição (`applyItemTableFieldEdit`) é uma substituição cirúrgica de bytes, igual ao editor de OPS: troca só o texto escolhido (nome OU descrição) por sua nova codificação UTF-8, desloca o resto do arquivo, nunca toca no bloco numérico de 127 bytes nem em nenhum outro registro. Testado com um round-trip completo (editar nome + descrição com acentos portugueses, depois desfazer as duas edições) reproduzindo o arquivo original **byte a byte idêntico** — essa foi a barra de confiança antes de expor isso na UI.

## Fase 3 — Editores de Nomes e Lugares (.tbl): a peça que fecha o ciclo

Depois da primeira entrega da Fase 3, o usuário mandou mais três arquivos `.tbl` reais: `t_place.tbl` (30026 bytes/474 lugares), `t_evtable.tbl` (132413 bytes/1981 eventos) e `t_name.tbl` (150070 bytes/1581 nomes). Os 3 compartilham um cabeçalho de registro **diferente** do de item, mas comum entre eles:

```
<tag ASCII, ex "PlaceTableData"><NUL>
<uint16 LE "lenField" = tamanho do registro, contado a partir do byte logo APÓS o próprio lenField>
<uint16 LE "idField">
<N strings NUL-terminadas...>
```

A tag aparece 1x a mais no arquivo do que o número de registros declarado no cabeçalho (a 1ª ocorrência é só o preâmbulo). Diferença importante em relação ao editor de item: aqui existe um campo de tamanho de verdade (`lenField`) que precisa ser recalculado toda vez que o texto muda de tamanho — `applyTaggedTableFieldEdit` faz isso sozinho, escrevendo os 2 bytes corretos depois de cada edição.

O que cada arquivo revelou, analisado byte a byte antes de escrever qualquer parser:

- **`t_place.tbl`**: as strings de cada registro consomem o registro inteiro (sem sobra), mas a quantidade de campos varia (10, 11 ou 12 — lugares "de nível superior" têm menos campos que sub-lugares dentro de uma cidade). O título/nome do lugar está **sempre no 4º campo contando do fim**, em **100% dos 474 registros reais**, sem exceção.
- **`t_name.tbl`**: **todo** registro (1581 de 1581, sem exceção) tem exatamente 6 campos, seguidos de 19 bytes de sobra fixos (nunca tocados, formato não decifrado). O nome de exibição do personagem é sempre o 1º campo — inclui variantes de traje/roupa como registros próprios ("Rean", "Rean: Swimsuit", "Rean: Bath Towel"...).
- **`t_evtable.tbl`**: também decifrado (cada evento = ID + nome interno tipo `EV_00_00_00`/`QS_0430_06B` + nome do arquivo de script alvo tipo `m3040`/`f1000`), mas **não ganhou editor de texto** — esses "nomes" são códigos internos do jogo, não texto visível ao jogador, então não há nada pra traduzir aqui. O valor desse arquivo pra modding é outro (registrar um evento NOVO ao criar uma cena customizada, conforme o PDF descreve) — ficou fora desta entrega por ser uma operação de "adicionar registro" bem diferente de "editar texto existente", que é o que as outras 4 telas fazem.

Os dois editores novos (`parsePlaceTable`/`parseNameTable`) tiveram cobertura **melhor que a do item**: 100% dos registros reconhecidos nos dois arquivos reais, zero exceção — bem diferente dos ~89% do item table, porque esses dois formatos têm estrutura bem mais regular. Testados com o mesmo round-trip byte a byte (editar com acento português + desfazer = arquivo original idêntico) antes de aparecer na UI.

## Investigação dos OP codes amigáveis nos cards de tradução (OP29/OP41) — e por que nenhum dos dois entrou

Escaneei o corpus completo de cenas que o usuário mandou (`Scena.zip`, 364 arquivos `.xlsx`, todos os OP codes "amigáveis" documentados: 2, 5, 22, 29, 36, 38, 39, 41, 47, 54, 55, 60, 172) pra achar TUDO que ainda não estava sendo extraído pro card principal de tradução:

- **OP2, OP5, OP47, OP60 — de fora.** ~185 mil valores checados: nome de função/evento (`TK_QuestUI_DebugQuestFlag`), coordenada/ref de objeto (`go_v0010`, `tbox00`), tag de animação (`AniEv7257`, `AniSitWait`), código de expressão facial (`#E_0#M_0`) — nada disso é traduzível, confirma a lista de categorias técnicas que o usuário passou (variáveis de baú/objeto, scripts de evento, coordenadas de teleporte, animação/batalha, IDs de modelo 3D).
- **OP41 (menu/ARCUS) — investigado a fundo e de fora.** Escanear os 79 arquivos onde aparece (4366 valores) mostrou que é essencialmente sempre um menu de navegação interno da ferramenta de QA — rótulos de pose/animação pra escolher qual variante disparar num teste (`"Musse brings her lips close to Rean, then stops"`, `"BTL_WAIT 5"`), nunca texto visto pelo jogador. 57% do total vem só de um arquivo de debug confirmado.
- **OP29 (nome de personagem/NPC/objeto criado) — chegou a ser extraído numa entrega anterior, removido a pedido do usuário.** A coluna era confirmadamente o nome de exibição ("Alisa", "Chancellor Osborne", "Girl Student ①"), mas são nomes próprios que o usuário não pretende alterar — não fazem sentido como card de tradução.

**O que ficou no lugar disso:** todo card do fluxo principal (diálogo, OP36/OP39) agora mostra um selo âmbar com o OP Code de origem e uma descrição curta — ex. `OP39: Diálogo — nome do interlocutor`, `OP36: Diálogo — texto` — lido da mesma tabela `SCENE_OP_LABELS` usada pelo Editor de Cenas. A ideia é dar esse contexto ("de qual instrução do jogo veio este texto, e o que ela representa") sem reintroduzir conteúdo que não deve ser traduzido — se o OP Code não estiver na tabela de rótulos amigáveis, o selo mostra só o número (`OP12`).

## Limitações conhecidas

- Os ícones em `src-tauri/icons/` são placeholders gerados por script (texto "CS3" sobre o tema escuro/âmbar do app) — troque pelos ícones finais quando tiver a arte definitiva.
- O app ainda carrega React/Babel/SheetJS via CDN (unpkg) em tempo de execução, igual ao HTML original — ou seja, precisa de internet pra abrir, mesmo sem usar nenhum motor de tradução por IA. Vender essas libs localmente é uma melhoria natural futura.
- **Editor de Cenas — campos cobertos:** o parser é genérico (lê o tipo de cada parâmetro a partir do PRÓPRIO cabeçalho da instrução na planilha, não de uma tabela fixa por OP code), então funciona pra qualquer OP code, documentado ou não. Só ~13 OP codes (2, 5, 22, 29, 36, 38, 39, 41, 47, 54, 55, 60, 172) ganham um nome amigável (do PDF de documentação) — os outros aparecem só como "OP <número>", editáveis igual, sem rótulo. OP 41 e 54 são multi-variante (formato muda pelo primeiro parâmetro) — confirmado com dados reais.
- **Editor de Cenas — comandos Rust não testados:** escritos e revisados à mão, sem compilar (mesma limitação de rede/toolchain da Fase 1). A lógica de parsing do `.xlsx` (a parte que decide o que é seguro editar) foi validada em Node contra um recorte real do arquivo de cena que o usuário mandou (`a0000.xlsx`) — 282 testes automatizados, incluindo o caso real de branch/pointer/diálogo. A parte Rust (achar o arquivo novo gerado pelo decompilador comparando a pasta antes/depois, escrever o `.xlsx` temporário, chamar o `.exe`) só será validada no primeiro build de verdade.
- **Nomes de instalação do decompilador:** `run_decompiler` espera `SenScriptsDecompiler.exe` direto dentro da pasta configurada (mesma estrutura de pastas do `converter_em_lote.bat` do usuário). Se a instalação dele for diferente disso, avisa que dá pra ajustar.
- **Calculadora de ID — testada com confiança:** a fórmula (`base do prefixo + número × 0xA`) foi conferida à mão, byte a byte, contra o único exemplo numérico que o PDF de documentação mostra (`m0292` → `0x000625E8`) — bate exatamente. 9 testes automatizados cobrem os 9 prefixos e os casos de erro (prefixo desconhecido, nome vazio).
- **Editor de OPS — formato validado só contra o PDF, não contra um arquivo real:** a fixture de teste (nomes `go_m0280`/`RANDY1`/`AV_D_ED`) é uma transcrição literal do exemplo citado no PDF de documentação, não um `.ops` que o usuário enviou. A lógica de edição em si é de baixo risco (nunca reconstrói a linha inteira, só troca o valor entre aspas do atributo escolhido — 9 testes automatizados cobrem isso, incluindo "várias edições na mesma linha" e "atributo inexistente é ignorado"), mas recomendo abrir o `.ops` editado num editor de texto antes de usar em produção, pelo menos na primeira vez.
- **Itens (.tbl) — cobertura parcial de propósito:** reconhece ~89% dos itens do `t_item_en.tbl` real que o usuário mandou (834 de 937) — o resto (provavelmente uma seção com layout diferente, ver seção própria acima) fica de fora, sem risco, mas também sem edição. Só nome e descrição são editáveis; o bloco de 127 bytes de dados numéricos de cada item (preço? peso? stats? — não decifrado) nunca é tocado, então não dá pra mudar preço, categoria, efeito, etc. por aqui ainda.
- **Nomes/Lugares (.tbl) — cobertura total nos arquivos testados, mas só esses dois:** `t_name.tbl` e `t_place.tbl` tiveram 100% dos registros reconhecidos nos arquivos reais que o usuário mandou — mas isso não garante 100% em QUALQUER `t_name.tbl`/`t_place.tbl` (só no que foi testado). `t_evtable.tbl` foi decifrado mas não ganhou editor (não tem texto traduzível, só códigos internos — ver seção acima). Nenhum outro `.tbl` do jogo (t_orb, t_magic, t_active, t_voice, t_bgm, etc.) foi analisado ainda — cada um provavelmente tem um layout de registro próprio, igual os 4 que já foram vistos são todos diferentes entre si.
- **Editores de .tbl em geral — vale conferir antes de usar:** como qualquer editor binário de formato não-oficial (nenhum dos 4 arquivos veio com spec oficial, só reverse engenharia contra arquivos reais), testado com round-trip byte a byte, mas vale abrir o `.tbl` editado num diff/hex antes de substituir o do jogo, pelo menos na primeira vez.
- **Selo de OP Code nos cards cobre só quem já é extraído.** Como o nome do OP29 foi removido da extração (nomes próprios, ver seção própria acima), o selo na prática hoje só aparece como `OP36: ...` ou `OP39: ...`, já que são os únicos OP codes que alimentam o card principal. Fica pronto pra qualquer extração futura mostrar seu próprio selo automaticamente (basta estar em `SCENE_OP_LABELS`), mas não há mais nada além de diálogo passando por ali agora.
- **Text.zip (54 `.tbl` de `data/text`) e Talk.zip (96 `.xlsx` de `data/talk`) — levantados mas não totalmente aproveitados.** Talk.zip usa o mesmo formato de diálogo já coberto (OP36), nenhuma mudança necessária. Text.zip tem ~20 arquivos com bastante texto genuíno ainda sem editor dedicado (`t_mons`, `t_quest`, `t_notechar`, `t_magic`, `t_active`, `t_text`, entre outros) — cada um precisaria da mesma reverse engenharia byte a byte feita pra item/nome/lugar; ficou de fora desta entrega por volume (aguardando o usuário priorizar quais valem o esforço).
