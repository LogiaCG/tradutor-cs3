# Análise: Suite de Modding CS3 para Windows 11

Análise técnica para transformar o Tradutor-CS3 (hoje um HTML único rodando no navegador) e o workflow de edição de cenas descrito na documentação do Sen Scripts Decompiler em um único app nativo para Windows 11, cobrindo tanto tradução quanto edição de script/cena.

## Stack recomendada: Tauri

Electron, Tauri e reescrita nativa (WinUI 3) foram as três opções avaliadas. WinUI 3 exigiria reescrever toda a interface em C#/XAML, jogando fora as ~7 mil linhas de React já testadas (batching, QA, memória de tradução, revisor de coerência) — descartado. Entre Electron e Tauri, o Tauri leva pela combinação de instalador pequeno (10-20 MB contra 150 MB+ do Electron), um backend em Rust que é a escolha certa para parsing binário seguro dos arquivos `.dat`/`.tbl`/`.ops`, e a possibilidade de rodar a interface React/Babel atual dentro da webview quase sem alterações — a tela de tradução migra praticamente como está, trocando `localStorage`/File System Access API por acesso nativo a arquivos (sem os limites de sandbox do navegador).

## Dois módulos, um projeto

**Módulo de tradução** — é o Tradutor-CS3_6_batching de hoje, com armazenamento migrado para arquivos nativos em vez de localStorage do navegador (permite projetos maiores sem limite de sandbox).

**Módulo de edição de cena/script (novo)** — a parte que a documentação descreve sendo feita manualmente hoje em planilha Excel:

- Editor com formulários tipados para os OP codes já documentados: OP 2 (início de evento), OP 29 (criar personagem), OP 47/57 (atribuir/tocar animação), OP 55 (posição X/Y/Z/orientação), OP 54 (câmera, variante por posição@frame e por orientação), OP 22 (delay), o grupo de diálogo OP 39/60/36/38 (nome do falante, expressão facial, texto+voz+continuação tratados como um bloco só em vez de 4 linhas soltas), OP 172 (encadeamento de evento) e OP 5 (branch condicional usado em menus).
- OP codes que a própria documentação marca como não totalmente entendidos (OP 30, variantes 5/11 do OP 54, OP 86/87) ficam **somente leitura** na interface — mostrados em bruto, sem tentar adivinhar o formato, pra não arriscar corromper o arquivo.
- Editor de tabelas TBL (`t_evtable`, `t_name`, `t_place`, `t_magic`, `t_bgm`, `t_mapbgm`, `t_voice`) — necessário porque toda edição de cena referencia IDs dessas tabelas.
- Assistente de criação de arquivo novo aplicando a fórmula documentada (`offset_base[letra] + hex(sufixo) * 0xA`), pra não precisar calcular ID na mão.
- Editor do XML de `OPS` (pontos de entrada no mapa que disparam funções de cena por posição do jogador), fechando o ciclo: criar cena → dar ID → conectar a um gatilho no mapa, tudo dentro do app.

Os dois módulos compartilham o mesmo projeto/arquivo, então um texto de diálogo editado na tela de tradução e o mesmo bloco de OP de diálogo editado na tela de cena apontam pra a mesma entrada — evita ter duas ferramentas desconectadas fazendo referência ao mesmo dado sem se falarem.

## Reaproveitar o Sen Scripts Decompiler ou reimplementar o parser?

Duas rotas pra ler/escrever `.dat`:

**Rota 1 (recomendada para a v1):** o app chama o SenScriptsDecompiler existente por baixo dos panos (nos mesmos moldes da ponte que já foi feita nesta sessão) e constrói uma interface de verdade sobre o `.xlsx` que ele gera, em vez do usuário editar célula por célula. Menor risco: o decompilador já é ferramenta comprovada pra ida-e-volta sem corromper o arquivo, inclusive nos casos não documentados no PDF.

**Rota 2 (v2, opcional):** reimplementar o parser binário nativamente em Rust usando só os OP codes documentados no PDF, sem depender de Excel. Mais limpo e mais rápido, mas arriscado nos OP codes que a documentação não cobre por completo — sem ver o comportamento exato do decompilador externo pra esses casos, uma reimplementação pode corromper silenciosamente cenas que usem esses OPs.

Recomendo começar pela Rota 1: entrega uma interface de verdade mais rápido e mais seguro, migrando pra Rota 2 só depois que o conjunto de OP codes documentado se mostrar suficiente no uso real.

## Roteiro em fases

**Fase 1** — Empacotar o tradutor atual como app Tauri, sem editor de cena ainda. Valida empacotamento/instalador/acesso a arquivo nativo. Risco baixo, é essencialmente encanamento.

**Fase 2** — Editor de cena MVP: via `.xlsx` (chamando o SenScriptsDecompiler), com formulários tipados só pros OP codes bem documentados (2, 29, 47, 57, 55, 54 variantes 2/4, 22, grupo de diálogo 39/60/36/38, 172, 5, 41). Os não documentados (30, 54 variantes 5/11, 86/87) ficam em modo bruto/somente-leitura.

**Fase 3** — Editor de TBL + assistente de ID de arquivo novo + editor de gatilhos OPS, fechando o ciclo completo de criação de cena customizada dentro do app.

**Fase 4 (opcional)** — Trocar a chamada ao SenScriptsDecompiler por um parser nativo em Rust, uma vez validada a cobertura dos OP codes documentados contra arquivos reais do jogo.

## Riscos

Variantes de OP code não documentadas são o maior risco de corrupção silenciosa — por isso ficam somente-leitura até serem mapeadas com confiança. A Rota 1 depende da disponibilidade/licença do SenScriptsDecompiler.exe como ferramenta externa. E vale dizer com todas as letras: isso é um projeto de engenharia bem maior que o revisor de coerência que acabou de ser entregue — estimar por fase em vez de tentar entregar tudo de uma vez reduz bastante o risco de ficar preso numa reescrita grande sem nada funcionando no meio do caminho.
