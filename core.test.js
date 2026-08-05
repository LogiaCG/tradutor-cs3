// core.test.js — suite de testes das funções puras de core.js, usando o
// test runner nativo do Node (node:test / node:assert), sem dependência
// externa (não há acesso à rede aqui pra instalar Jest/Vitest).
//
// Rodar com: node --test core.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./core.js");

// ---------------------------------------------------------------------------
// Códigos de controle do jogo — a parte mais crítica: um bug aqui pode
// quebrar/crashar o jogo de verdade (código perdido ou corrompido na
// tradução), por isso o cuidado extra nos testes de ida-e-volta.
// ---------------------------------------------------------------------------

test("extractCodes encontra códigos simples e compostos", () => {
  assert.deepEqual(core.extractCodes("#E[12]#M_0#B_0 Hello world"), ["#E[12]", "#M_0", "#B_0"]);
  assert.deepEqual(core.extractCodes("Sem códigos aqui"), []);
  assert.deepEqual(core.extractCodes("#C texto #I mais texto"), ["#C", "#I"]);
});

test("protectCodes + restoreCodes é uma ida-e-volta perfeita (round-trip)", () => {
  const casos = [
    "#E[12]#M_0#B_0 Hello world",
    "Texto sem nenhum código",
    "Meio da #C frase #I com dois códigos",
    "#E[1]#M_2#B_0#H texto no fim #V",
  ];
  for (const original of casos) {
    const { protectedText, tokens } = core.protectCodes(original);
    const restored = core.restoreCodes(protectedText, tokens);
    assert.equal(restored, original, `falhou para: ${original}`);
  }
});

test("protectCodes insere espaço TEMPORÁRIO quando o código está colado numa palavra, mas restoreCodes devolve colado", () => {
  // ver o comentário de protectCodes/restoreCodes no core.js: o espaço é só
  // pra ajudar o motor de tradução a não engolir o código junto
  // ("#B_0Let's" -> "§0§ Let's" durante a tradução) — mas a tradução final
  // tem que voltar COLADA ao código, do jeito que o jogo espera.
  const { protectedText, tokens } = core.protectCodes("#B_0Let's go!");
  assert.equal(tokens[0].text, "#B_0");
  assert.equal(tokens[0].glueAfter, true);
  assert.equal(protectedText, "§0§ Let's go!");
  const restored = core.restoreCodes(protectedText, tokens);
  assert.equal(restored, "#B_0Let's go!", "tradução deve voltar colada ao código, sem o espaço temporário");
});

test("restoreCodes remove até espaço que o motor de tradução tenha adicionado, quando o código era colado no original", () => {
  const { protectedText, tokens } = core.protectCodes("#B_0Let's go!");
  // simula um motor de tradução que devolveu com MAIS espaço ao redor do
  // placeholder do que o que protectCodes inseriu — ainda assim tem que
  // ficar colado no restore, porque glueAfter está marcado.
  const fakeTranslated = protectedText.replace("§0§ Let's", "§0§   Vamos");
  const restored = core.restoreCodes(fakeTranslated, tokens);
  assert.equal(restored, "#B_0Vamos go!");
});

test("protectCodes junta códigos consecutivos num só placeholder", () => {
  const { protectedText, tokens } = core.protectCodes("#E_2#M_4#B_0Hello");
  // não pode sobrar mais de um placeholder pros três códigos colados
  const placeholders = protectedText.match(/§\d+§/g) || [];
  assert.equal(placeholders.length, 1);
  assert.equal(tokens[0].text, "#E_2#M_4#B_0");
});

test("protectCodes preserva os códigos mesmo se o tradutor mangling o espaçamento", () => {
  const { protectedText, tokens } = core.protectCodes("#E[1] Oi #B_0 tchau");
  // simula um "tradutor" que só troca as palavras, mantendo os placeholders
  const fakeTranslated = protectedText.replace("Oi", "Hi").replace("tchau", "bye");
  const restored = core.restoreCodes(fakeTranslated, tokens);
  assert.match(restored, /#E\[1\]/);
  assert.match(restored, /#B_0/);
  assert.match(restored, /Hi/);
  assert.match(restored, /bye/);
});

// ---------------------------------------------------------------------------
// Quebra de linha (wrapToLineCount) — importante pra não estourar a caixa de
// diálogo do jogo.
// ---------------------------------------------------------------------------

test("wrapToLineCount devolve o texto intacto quando lineCount <= 1", () => {
  assert.equal(core.wrapToLineCount("uma frase qualquer", 1), "uma frase qualquer");
  assert.equal(core.wrapToLineCount("uma frase qualquer", 0), "uma frase qualquer");
});

test("wrapToLineCount produz exatamente N linhas sem cortar palavras", () => {
  const text = "this is a reasonably long sentence that should wrap into three lines nicely";
  const wrapped = core.wrapToLineCount(text, 3);
  const lines = wrapped.split("\n");
  assert.equal(lines.length, 3);
  // nenhuma palavra do original pode ter sido cortada ao meio
  const rejoined = lines.join(" ").replace(/\s+/g, " ").trim();
  assert.equal(rejoined, text.replace(/\s+/g, " ").trim());
});

// ---------------------------------------------------------------------------
// Detecção de idioma — palavras funcionais + fallback de trigrama
// ---------------------------------------------------------------------------

test("detectLanguage reconhece frases completas em pt/en", () => {
  assert.equal(core.detectLanguage("Bom dia, como você está hoje?"), "pt");
  assert.equal(core.detectLanguage("Good morning, how are you today?"), "en");
  assert.equal(core.detectLanguage("Obrigado por tudo, meu amigo."), "pt");
  assert.equal(core.detectLanguage("Thank you for everything, my friend."), "en");
});

test("detectLanguage não quebra com string vazia ou só código de jogo", () => {
  assert.doesNotThrow(() => core.detectLanguage(""));
  assert.doesNotThrow(() => core.detectLanguage("#E[1]#M_0#B_0"));
});

test("detectLanguageByTrigram só opina quando tem margem de confiança", () => {
  // Com margem larga, acerta o idioma sem depender de nenhuma palavra das
  // listas PT_WORDS/EN_WORDS.
  assert.equal(core.detectLanguageByTrigram("Estranhamente silencioso, o corredor parecia vazio."), "pt");

  // Este outro fica a 8.8% de margem — os dois perfis praticamente
  // empatados. Devolver um vencedor aí seria sorteio disfarçado de
  // detecção, que era a origem do falso positivo "está em inglês" em linha
  // portuguesa. O contrato correto do FALLBACK é calar quando não sabe.
  assert.equal(core.detectLanguageByTrigram("Strangely quiet, the corridor seemed empty."), null);

  // E a função de verdade (detectLanguage) continua acertando, porque as
  // palavras reconhecidas resolvem antes de chegar no trigrama.
  assert.equal(core.detectLanguage("Strangely quiet, the corridor seemed empty."), "en");
});

// ---------------------------------------------------------------------------
// Pontuação protegida (parênteses, reticências) — usada pelos motores
// estatísticos (MyMemory/LibreTranslate) que costumam comer esses símbolos
// ---------------------------------------------------------------------------

test("protectPunctuation + restorePunctuation é ida-e-volta perfeita", () => {
  const casos = ["Isso é (muito) importante...", "Sem pontuação especial", "Reticências no fim…", "(parênteses) e (mais parênteses)"];
  for (const original of casos) {
    const { protectedText, tokens } = core.protectPunctuation(original);
    const restored = core.restorePunctuation(protectedText, tokens);
    assert.equal(restored, original, `falhou para: ${original}`);
  }
});

// ---------------------------------------------------------------------------
// Nomes próprios protegidos
// ---------------------------------------------------------------------------

test("protectProperNouns substitui pelo termo traduzido e restoreProperNouns funciona", () => {
  const properNouns = [{ term: "Thors Academy", translation: "Academia Thors" }];
  const { text: protectedText, tokens } = core.protectProperNouns("Welcome to Thors Academy today", properNouns);
  assert.ok(!protectedText.includes("Thors Academy"));
  const restored = core.restoreProperNouns(protectedText, tokens);
  assert.match(restored, /Academia Thors/);
});

test("protectProperNouns mantém o termo original quando não há tradução cadastrada", () => {
  const properNouns = [{ term: "Rean", translation: "" }];
  const { text: protectedText, tokens } = core.protectProperNouns("Rean walked away", properNouns);
  const restored = core.restoreProperNouns(protectedText, tokens);
  assert.match(restored, /Rean/);
});

// ---------------------------------------------------------------------------
// Import de duas colunas (original,tradução)
// ---------------------------------------------------------------------------

test("parseTwoColumnImport lê linhas separadas por vírgula e por tab", () => {
  const rows = core.parseTwoColumnImport('Hello,Olá\n"With, comma",Com vírgula\nOnly one column');
  assert.equal(rows.length >= 2, true);
  assert.equal(rows[0].original, "Hello");
  assert.equal(rows[0].translation, "Olá");
});

// ---------------------------------------------------------------------------
// QA: código faltando/alterado (crítico), contagem de linha, glossário
// ---------------------------------------------------------------------------

test("checkEntryIssues aponta severidade crítica quando um código do jogo some na tradução", () => {
  const entry = { original: "#E[1] Hello #B_0 world", lineCount: 1, codes: core.extractCodes("#E[1] Hello #B_0 world") };
  const issues = core.checkEntryIssues(entry, "Olá mundo", []); // tradução sem nenhum dos dois códigos
  const critical = issues.filter((i) => i.severity === "critical");
  assert.ok(critical.length > 0, "deveria ter achado pelo menos 1 problema crítico");
});

test("checkEntryIssues não aponta nada quando os códigos estão todos presentes", () => {
  const entry = { original: "#E[1] Hello #B_0 world", lineCount: 1, codes: core.extractCodes("#E[1] Hello #B_0 world") };
  const issues = core.checkEntryIssues(entry, "#E[1] Olá #B_0 mundo", []);
  const critical = issues.filter((i) => i.severity === "critical");
  assert.equal(critical.length, 0);
});

test("findGlossaryMismatches aponta termo do glossário sem a tradução fixa aplicada", () => {
  const properNouns = [{ term: "Thors Academy", translation: "Academia Thors" }];
  const mismatches = core.findGlossaryMismatches("Welcome to Thors Academy", "Bem-vindo à academia", properNouns);
  assert.ok(mismatches.length > 0);
});

// ---------------------------------------------------------------------------
// Prompts de LLM (single-item e batch) e parser da resposta em lote
// ---------------------------------------------------------------------------

test("buildLlmSystemPrompt inclui o glossário quando fornecido", () => {
  const prompt = core.buildLlmSystemPrompt([{ term: "Rean", translation: "" }]);
  assert.match(prompt, /Rean/);
  assert.match(prompt, /Trails of Cold Steel/);
});

test("buildLlmBatchSystemPrompt pede formato JSON de entrada/saída", () => {
  const prompt = core.buildLlmBatchSystemPrompt([]);
  assert.match(prompt, /"items"/);
  assert.match(prompt, /"translations"/);
});

test("parseBatchTranslationResponse aceita array puro e objeto {translations:[...]}", () => {
  assert.deepEqual(core.parseBatchTranslationResponse('["a","b"]', 2), ["a", "b"]);
  assert.deepEqual(core.parseBatchTranslationResponse('{"translations":["a","b"]}', 2), ["a", "b"]);
});

test("parseBatchTranslationResponse tira cerca de markdown antes de parsear", () => {
  const raw = '```json\n{"translations":["x","y"]}\n```';
  assert.deepEqual(core.parseBatchTranslationResponse(raw, 2), ["x", "y"]);
});

test("parseBatchTranslationResponse rejeita JSON inválido ou tamanho errado", () => {
  assert.throws(() => core.parseBatchTranslationResponse("não é json", 2));
  assert.throws(() => core.parseBatchTranslationResponse('["só um"]', 2));
});

// ---------------------------------------------------------------------------
// Backoff / retry
// ---------------------------------------------------------------------------

test("computeBackoffDelay respeita retryAfterMs quando presente", () => {
  const delay = core.computeBackoffDelay(0, 5000);
  assert.ok(delay >= 5000 && delay < 5300);
});

test("computeBackoffDelay cresce exponencialmente sem retryAfterMs", () => {
  const d0 = core.computeBackoffDelay(0, null);
  const d3 = core.computeBackoffDelay(3, null);
  assert.ok(d3 > d0);
});

test("parseRetryAfterMs lê o header em segundos", () => {
  const fakeRes = { headers: { get: (k) => (k === "retry-after" ? "2" : null) } };
  assert.equal(core.parseRetryAfterMs(fakeRes), 2000);
});

test("parseRetryAfterMs devolve null quando não há header", () => {
  const fakeRes = { headers: { get: () => null } };
  assert.equal(core.parseRetryAfterMs(fakeRes), null);
});

// ---------------------------------------------------------------------------
// TMX / diversos utilitários
// ---------------------------------------------------------------------------

test("escapeXml escapa os cinco caracteres especiais do XML", () => {
  assert.equal(core.escapeXml(`<a> & "b" 'c'`), "&lt;a&gt; &amp; &quot;b&quot; &apos;c&apos;");
});

test("tmxTimestamp produz o formato AAAAMMDDTHHMMSSZ", () => {
  const ts = core.tmxTimestamp(0); // epoch
  assert.match(ts, /^\d{8}T\d{6}Z$/);
});

test("baseName remove só a extensão .xlsx do final", () => {
  assert.equal(core.baseName("roteiro01.xlsx"), "roteiro01");
  assert.equal(core.baseName("sem_extensao"), "sem_extensao");
});

test("safeForFilename troca caracteres inválidos de nome de arquivo", () => {
  assert.equal(core.safeForFilename('a/b:c*d?e"f<g>h|i'), "a-b-c-d-e-f-g-h-i");
  assert.equal(core.safeForFilename("   "), "Projeto");
});

test("textSimilarity dá 1 pra textos idênticos e menos que 1 pra diferentes", () => {
  assert.equal(core.textSimilarity("hello world", "hello world"), 1);
  assert.ok(core.textSimilarity("hello world", "goodbye moon") < 1);
});

// ---------------------------------------------------------------------------
// parseWorkbookEntries — testado com um mock mínimo de XLSX.utils.decode_cell
// (não a lib real SheetJS, que não pôde ser instalada offline nesta sessão;
// isso testa a lógica de varredura de linha/coluna/OP-code em si).
// ---------------------------------------------------------------------------

function fakeDecodeCell(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  const colLetters = m[1];
  let c = 0;
  for (const ch of colLetters) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]) - 1, c: c - 1 };
}
function fakeEncodeCell({ r, c }) {
  let s = "";
  let n = c + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s + (r + 1);
}
const fakeXLSX = { utils: { decode_cell: fakeDecodeCell, encode_cell: fakeEncodeCell } };

test("parseWorkbookEntries extrai só as colunas tipadas dialog/string relevantes", () => {
  // Linha 1: cabeçalho ("Location" na coluna A, tipos nas colunas seguintes)
  // Linha 2: um bloco de dados com OP Code 39 (diálogo) e uma célula "dialog"
  const ws = {
    A1: { v: "Location" },
    B1: { v: "opcode" },
    D1: { v: "dialog" },
    A2: { v: 100 }, // location numérico -> início de bloco
    B2: { v: 39 },  // OP Code 39 = diálogo
    D2: { v: "Hello there" },
  };
  const workbook = { SheetNames: ["Sheet1"], Sheets: { Sheet1: ws } };
  const result = core.parseWorkbookEntries(workbook, fakeXLSX);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].original, "Hello there");
  assert.equal(result.entries[0].location, 100);
  assert.equal(result.entries[0].lang, "en");
});

test("parseWorkbookEntries ignora blocos sem OP Code 39 e sem coluna tipo dialog", () => {
  const ws = {
    A1: { v: "Location" },
    B1: { v: "opcode" },
    C1: { v: "string" },
    A2: { v: 200 },
    B2: { v: 12 }, // OP Code diferente de 39
    C2: { v: "Not extracted" },
  };
  const workbook = { SheetNames: ["Sheet1"], Sheets: { Sheet1: ws } };
  const result = core.parseWorkbookEntries(workbook, fakeXLSX);
  assert.equal(result.entries.length, 0);
});

// ---------------------------------------------------------------------------
// opCode/opLabel em cada entry — cada card agora carrega de qual OP Code ele
// veio e um rótulo pronto pra exibir (lido de SCENE_OP_LABELS, a mesma
// tabela do Editor de Cenas), pra dar contexto sem precisar abrir a outra
// aba. (A extração do nome de personagem do OP29 foi removida a pedido do
// usuário — são nomes próprios, ele não vai traduzi-los.)
// ---------------------------------------------------------------------------

test("parseWorkbookEntries anota opCode e opLabel (OP39, com nome amigável)", () => {
  const ws = {
    A1: { v: "Location" },
    B1: { v: "opcode" },
    C1: { v: "string" },
    A2: { v: 100 },
    B2: { v: 39 }, // OP39 = diálogo, nome do interlocutor
    C2: { v: "Rean" },
  };
  const workbook = { SheetNames: ["Sheet1"], Sheets: { Sheet1: ws } };
  const result = core.parseWorkbookEntries(workbook, fakeXLSX);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].opCode, 39);
  assert.equal(result.entries[0].opLabel, "OP39: Diálogo — nome do interlocutor");
});

test("parseWorkbookEntries anota opCode sem nome amigável quando o OP Code não está no dicionário", () => {
  const ws = {
    A1: { v: "Location" },
    B1: { v: "opcode" },
    D1: { v: "dialog" },
    A2: { v: 200 },
    B2: { v: 999 }, // OP Code fora de SCENE_OP_LABELS
    D2: { v: "Texto qualquer" },
  };
  const workbook = { SheetNames: ["Sheet1"], Sheets: { Sheet1: ws } };
  const result = core.parseWorkbookEntries(workbook, fakeXLSX);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].opCode, 999);
  assert.equal(result.entries[0].opLabel, "OP999");
});

test("parseWorkbookEntries NÃO extrai mais nome de personagem do OP29 (removido a pedido do usuário)", () => {
  const ws = {
    A1: { v: "Location" },
    B1: { v: "opcode" },
    D1: { v: "string" },
    E1: { v: "string" },
    A2: { v: 10 },
    B2: { v: 29 }, // OP29 = criar personagem
    D2: { v: "C_CHR027" },
    E2: { v: "Chancellor Osborne" }, // nome próprio — não é mais extraído
  };
  const workbook = { SheetNames: ["Sheet1"], Sheets: { Sheet1: ws } };
  const result = core.parseWorkbookEntries(workbook, fakeXLSX);
  assert.equal(result.entries.length, 0);
});

// ---------------------------------------------------------------------------
// Projetos e arquivos abertos — auditoria pedida pelo usuário: escopar
// "todos" ao projeto ativo, evitar fragmentar projeto por maiúscula/espaço,
// evitar arquivo duplicado, e validar de verdade o .json de Colaboração.
// ---------------------------------------------------------------------------

test("resolveProjectName reaproveita a grafia já existente ignorando maiúscula/espaço", () => {
  assert.equal(core.resolveProjectName("cs3", ["CS3", "CS4"]), "CS3");
  assert.equal(core.resolveProjectName("  CS3  ", ["CS3"]), "CS3");
  assert.equal(core.resolveProjectName("CS4", ["CS3"]), "CS4"); // projeto novo, mantém a grafia digitada
  assert.equal(core.resolveProjectName("   ", ["CS3"]), null);
  assert.equal(core.resolveProjectName("", []), null);
});

test("docsInProject filtra só os docs do projeto pedido", () => {
  const docs = [{ id: 1, project: "CS3" }, { id: 2, project: "CS4" }, { id: 3, project: "CS3" }];
  const result = core.docsInProject(docs, "CS3");
  assert.deepEqual(result.map((d) => d.id), [1, 3]);
});

test("isDuplicateOpenFile detecta o mesmo projeto+arquivo já aberto", () => {
  const docs = [{ project: "CS3", fileName: "a0000.xlsx" }];
  assert.equal(core.isDuplicateOpenFile(docs, "CS3", "a0000.xlsx"), true);
  assert.equal(core.isDuplicateOpenFile(docs, "CS4", "a0000.xlsx"), false); // projeto diferente, não é duplicata
  assert.equal(core.isDuplicateOpenFile(docs, "CS3", "a0001.xlsx"), false);
});

test("parseProgressStorageKey lê projeto e arquivo de volta da chave de storage", () => {
  assert.deepEqual(core.parseProgressStorageKey("cs3progress:CS3:a0000.xlsx"), { project: "CS3", fileName: "a0000.xlsx" });
  assert.deepEqual(core.parseProgressStorageKey("cs3progress:Meu Projeto:tk_juna.xlsx"), { project: "Meu Projeto", fileName: "tk_juna.xlsx" });
  assert.equal(core.parseProgressStorageKey("cs3settings"), null); // não é chave de progresso
  assert.equal(core.parseProgressStorageKey("cs3progress:semarquivo"), null); // falta o ":arquivo"
});

test("validateProjectStateExport aceita só um export de verdade deste app", () => {
  const valid = { kind: "project-state-export", version: 1, docs: [] };
  assert.deepEqual(core.validateProjectStateExport(valid), { ok: true });

  // .json qualquer que por coincidência tem uma propriedade "docs" — antes
  // passava batido só checando Array.isArray(data.docs)
  assert.equal(core.validateProjectStateExport({ docs: [] }).ok, false);
  assert.equal(core.validateProjectStateExport({ docs: [] }).reason, "wrong-kind");

  assert.equal(core.validateProjectStateExport({ kind: "project-state-export" }).reason, "missing-docs");
  assert.equal(core.validateProjectStateExport(null).reason, "not-json-object");
  assert.equal(core.validateProjectStateExport([1, 2, 3]).reason, "not-json-object");

  // versão futura que este app ainda não entende — recusa em vez de mesclar campo desconhecido
  const future = { kind: "project-state-export", version: 99, docs: [] };
  assert.equal(core.validateProjectStateExport(future).reason, "newer-version");
});

// ---------------------------------------------------------------------------
// Regressão: detectLanguage estava marcando linha em INGLÊS como "pt" —
// (a) por causa de 1 acento perdido (nome estilizado/empréstimo) mesmo com
// palavras claramente inglesas ao redor, e (b) por causa do desempate de
// trigrama em empates que na verdade eram só ambiguidade genuína.
// ---------------------------------------------------------------------------

test("detectLanguage NÃO marca inglês como pt por causa de 1 acento perdido", () => {
  // "café" tem acento, mas o resto da frase é claramente inglês
  assert.equal(core.detectLanguage("I'll meet you at the café tomorrow"), "en");
  assert.equal(core.detectLanguage("She said his name was André, nothing else"), "en");
});

test("detectLanguage devolve unknown (não força pt) quando há sinal de palavra dos dois lados", () => {
  // frase artificialmente mista: 1 palavra pt, 1 palavra en, nenhuma decide —
  // antes isso podia cair no desempate de trigrama e virar "pt" com pouca
  // certeza; agora fica "unknown" (nunca é pulado do lote automático)
  const result = core.detectLanguage("que the");
  assert.equal(result, "unknown");
});

test("detectLanguage ainda reconhece pt/en normalmente quando a evidência de palavra é clara", () => {
  assert.equal(core.detectLanguage("Rean, você está pronto para a missão?"), "pt");
  assert.equal(core.detectLanguage("Rean, are you ready for the mission?"), "en");
});

// ---------------------------------------------------------------------------
// runQualityCheck + qaIgnored: ignorar avisos, nunca críticos
// ---------------------------------------------------------------------------

test("runQualityCheck some com o aviso quando a linha está em qaIgnored", () => {
  const doc = {
    id: 1,
    ignored: {},
    // a chave é o TIPO do problema; inglês agora entra em "wrong-language"
    qaIgnored: { A1: { "wrong-language": true } },
    entries: [{ ref: "A1", original: "Hello there", lineCount: 1, codes: [], lang: "en" }],
    translations: { A1: "Hello there" }, // "tradução" ainda em inglês de propósito
    verified: {},
  };
  const results = core.runQualityCheck([doc], []);
  assert.equal(results.length, 0, "o único aviso (wrong-language) foi ignorado, não deveria sobrar nada");
});

test("runQualityCheck NUNCA some com um problema crítico, mesmo se qaIgnored tiver essa chave", () => {
  const doc = {
    id: 1,
    ignored: {},
    // mesmo "forçando" ignorar missing-code manualmente no dado, a função
    // tem que ignorar esse pedido — crítico não pode ser escondido
    qaIgnored: { A1: { "missing-code": true } },
    entries: [{ ref: "A1", original: "#E[1] Hello world", lineCount: 1, codes: core.extractCodes("#E[1] Hello world"), lang: "en" }],
    translations: { A1: "Olá mundo" }, // perdeu o #E[1] na tradução
    verified: {},
  };
  const results = core.runQualityCheck([doc], []);
  assert.equal(results.length, 1, "o problema crítico não pode sumir");
  assert.ok(results[0].issues.some((i) => i.severity === "critical"));
});

test("runQualityCheck funciona normalmente sem qaIgnored definido (doc antigo/migrado)", () => {
  const doc = {
    id: 1,
    ignored: {},
    // sem campo qaIgnored — precisa não quebrar (docs salvos antes dessa
    // feature não têm esse campo)
    entries: [{ ref: "A1", original: "#E[1] Hello world", lineCount: 1, codes: core.extractCodes("#E[1] Hello world"), lang: "en" }],
    translations: { A1: "Olá mundo" },
    verified: {},
  };
  assert.doesNotThrow(() => core.runQualityCheck([doc], []));
});

// ===========================================================================
// Regressões vindas de um diagnóstico de QA REAL: 273 arquivos, 66.001
// linhas, 347 com problema. As strings abaixo são as do relatório, copiadas
// tal e qual — o valor delas está justamente em não serem inventadas.
// ===========================================================================

// --- 1. glossário cego a quebra de linha -----------------------------------
// wrapToLineCount reparte a tradução DEPOIS de pronta, e a quebra cai onde
// couber — inclusive no meio de um termo do glossário. Era a maior fonte de
// aviso falso do QA (199 de 358).

const GLOSSARIO_REAL = [
  { term: "Panzer Soldat", translation: "Panzer Soldat" },
  { term: "Hundred Days War", translation: "Guerra dos Cem Dias" },
  { term: "Bracer Guild", translation: "Guilda dos Bracers" },
  { term: "Class VII", translation: "Classe VII" },
  { term: "The Society", translation: "A Sociedade" },
  { term: "Divine Knight", translation: "Cavaleiro Divino" },
  { term: "Branch", translation: "Filial" },
];

test("glossário: termo partido por quebra de linha NÃO é mais falso positivo", () => {
  const casos = [
    ["#KThey left for Panzer Soldat training", "#KEles foram para o treinamento Panzer\nSoldat e fazer patrulhas"],
    ["a document about the Hundred Days War that", "um documento sobre a Guerra dos Cem\nDias que aconteceu"],
    ["The Crossbell branch of the Bracer Guild closed", "A filial de Crossbell da Guilda\ndos Bracers fechou"],
    ["Class VII's contact information was provided", "Informações de contato da Classe\nVII foram fornecidas"],
  ];
  for (const [orig, trad] of casos) {
    assert.deepEqual(
      core.findGlossaryMismatches(orig, trad, GLOSSARIO_REAL),
      [],
      `não devia acusar nada em: ${JSON.stringify(trad)}`
    );
  }
});

test("glossário: contração de artigo é português normal, não erro", () => {
  // "A Sociedade" cadastrado; a frase pede "à Sociedade" (a + a). Exigir a
  // forma literal reprovaria uma tradução impecável.
  assert.deepEqual(
    core.findGlossaryMismatches("I don't think he's affiliated with the society", "não acho que ele esteja ligado à Sociedade", GLOSSARIO_REAL),
    []
  );
});

test("glossário: plural do termo continua sendo o termo", () => {
  assert.deepEqual(
    core.findGlossaryMismatches("more supernatural power than the Divine Knight", "mais poder sobrenatural do que os Cavaleiros Divinos", GLOSSARIO_REAL),
    []
  );
});

test("glossário: o erro REAL do relatório continua sendo pego", () => {
  // Este é de verdade: "branch manager" (gerente da filial) virou
  // "gerente-adjunto" (que é outra coisa) em várias linhas. Afrouxar a
  // checagem não pode custar a captura disto.
  const r = core.findGlossaryMismatches(
    "He's the right-hand man of the branch manager, who's on leave",
    "É o homem de confiança do gerente-adjunto, que está de licença",
    GLOSSARIO_REAL
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].term, "Branch");
});

test("glossário: termo em inglês mantido de propósito também passa, mesmo quebrado", () => {
  // "Panzer Soldat" não se traduz — o esperado É o termo em inglês.
  assert.deepEqual(
    core.findGlossaryMismatches("for Panzer Soldat training", "para o treinamento Panzer\nSoldat", GLOSSARIO_REAL),
    []
  );
});

// --- 2. miolo vazio: a fala sumia sem ninguém perceber ----------------------

test("modelReturnedNothing pega a linha que virou só código", () => {
  // Caso real: '#3K#2U#4SWe'll show them the pride of\nNorth Ambria...'
  // ficou gravado como '#3K#2U#4S'. Todos os códigos presentes, nenhum
  // marcador vazado, nenhum código inventado — nada acusava, e a fala
  // simplesmente não existia mais no jogo.
  const original = "#3K#2U#4SWe'll show them the pride of North Ambria for the last time!";
  const prep = core.prepareForLlm(original);
  assert.ok(prep.protectedText.includes("North Ambria"), "o miolo tem que ir com texto");
  assert.equal(core.modelReturnedNothing(prep.protectedText, ""), true);
  // e o estrago que isso causaria, se passasse:
  assert.equal(core.reassembleFromLlm(prep, ""), "#3K#2U#4S");
});

test("modelReturnedNothing: devolver só marcador/pontuação conta como vazio", () => {
  assert.equal(core.modelReturnedNothing("Hello §0§ there", "§0§"), true);
  assert.equal(core.modelReturnedNothing("Hello there", "   "), true);
  assert.equal(core.modelReturnedNothing("Hello there", "..."), true);
});

test("modelReturnedNothing NÃO acusa quando não havia o que traduzir", () => {
  // linha só de código: voltar vazio é o comportamento correto
  assert.equal(core.modelReturnedNothing("§0§", ""), false);
  assert.equal(core.modelReturnedNothing("   ", ""), false);
});

test("modelReturnedNothing deixa tradução normal em paz", () => {
  assert.equal(core.modelReturnedNothing("Hello there", "Olá"), false);
});

// --- 3. colchete aninhado no código do jogo --------------------------------

test("código com colchete aninhado é lido inteiro (era o único crítico do relatório)", () => {
  const s = "#E[99999999999999999999999999999[autoE8]]#M_A#B_0Though I can't imagine what Dreichels would say.";
  const codes = core.extractCodes(s);
  assert.equal(codes[0], "#E[99999999999999999999999999999[autoE8]]", "o ] final faz parte do código");
  assert.deepEqual(codes.slice(1), ["#M_A", "#B_0"], "os códigos seguintes não podem se perder");
});

test("colchete aninhado: o pipeline inteiro fica sem perda", () => {
  const s = "#E[99999999999999999999999999999[autoE8]]#M_A#B_0Though I can't imagine what Dreichels would say.";
  const prep = core.prepareForLlm(s);
  assert.ok(!prep.protectedText.includes("]"), "não pode sobrar ] órfão no texto enviado ao modelo");
  assert.equal(core.reassembleFromLlm(prep, prep.protectedText), s);
});

test("colchete aninhado: formatos normais não regridem", () => {
  assert.deepEqual(core.extractCodes("#E[1]#M_0#B_0Olá"), ["#E[1]", "#M_0", "#B_0"]);
  assert.deepEqual(core.extractCodes("#E[I]#M_0#B_0Show me"), ["#E[I]", "#M_0", "#B_0"]);
  assert.deepEqual(core.extractCodes("#E[1]#M_0#E[2]"), ["#E[1]", "#M_0", "#E[2]"]);
  assert.deepEqual(core.extractCodes("#3K#2U#4Stexto"), ["#3K", "#2U", "#4S"]);
  assert.deepEqual(core.extractCodes("#800WShow"), ["#800W"]);
});

// --- 4. passthrough: o modelo devolvendo a entrada --------------------------

test("looksLikeUntranslated pega os formatos que o Qwen devolve sem traduzir", () => {
  // Todos vieram do relatório, com a saída idêntica à entrada.
  const passthrough = [
    "W-Was that Allie?!",
    "W-Was that...?!",
    "H-How can this be...?!",
    "I-I see...",
    "Show me the way...Black Alberich.",
    "DOST THOU DESIRE THE POWER?",
    "'Heed my call...Valimar, the Ashen Knight!'",
    "'Whoa, whoa, hold up just a sec. Aren't you forgetting something?'",
  ];
  for (const s of passthrough) {
    assert.equal(core.looksLikeUntranslated(s, s), true, `devia acusar: ${JSON.stringify(s)}`);
  }
});

test("looksLikeUntranslated NÃO acusa o que deve mesmo voltar igual", () => {
  // Nome próprio, sigla e interjeição voltam iguais porque ESTÃO certos.
  // Mandar isso pra retentativa seria queimar GPU à toa.
  for (const s of ["Valimar", "OK", "Rean Schwarzer", "Class VII", "Ashen Chevalier", "Hmph.", "..."]) {
    assert.equal(core.looksLikeUntranslated(s, s), false, `não devia acusar: ${JSON.stringify(s)}`);
  }
});

test("looksLikeUntranslated ignora quem de fato traduziu", () => {
  assert.equal(core.looksLikeUntranslated("Hello there", "Olá"), false);
  assert.equal(core.looksLikeUntranslated("H-How can this be...?!", "C-Como isso é possível?!"), false);
});

// --- 5. retentativa deixa de repetir o mesmo erro ---------------------------

test("retentativa muda a semente — sem isso o retry é inútil no modelo local", () => {
  // temperature 0 + seed fixa = mesma resposta byte a byte. As três falhas
  // que pedem retentativa (idioma errado, vazio, passthrough) repetiam o
  // erro idêntico duas vezes antes de desistir.
  const s0 = core.seedForAttempt({});
  const s1 = core.seedForAttempt({ retryAttempt: 1 });
  const s2 = core.seedForAttempt({ retryAttempt: 2 });
  assert.equal(s0, 7, "1ª tentativa mantém o determinismo de sempre");
  assert.notEqual(s1, s0);
  assert.notEqual(s2, s1);
});

test("retentativa: 1ª é determinística, as seguintes abrem a temperatura", () => {
  assert.equal(core.temperatureForAttempt({}), 0);
  assert.ok(core.temperatureForAttempt({ retryAttempt: 1 }) > 0);
});

test("retryAttemptOf aguenta lixo sem quebrar", () => {
  for (const v of [undefined, null, {}, { retryAttempt: "x" }, { retryAttempt: -3 }, { retryAttempt: NaN }]) {
    assert.equal(core.retryAttemptOf(v), 0);
  }
});

test("o corpo do Ollama carrega a semente da tentativa", () => {
  const base = { openaiNumCtx: 8192, llmModel: "qwen2.5:7b" };
  const t0 = core.buildOllamaNativeBody(base, "sys", "user", 1024, false, 0);
  const t1 = core.buildOllamaNativeBody({ ...base, retryAttempt: 1 }, "sys", "user", 1024, false, 0);
  assert.equal(t0.options.seed, 7);
  assert.equal(t0.options.temperature, 0);
  assert.notEqual(t1.options.seed, t0.options.seed);
  assert.ok(t1.options.temperature > 0);
});

// --- 6. prompt contra passthrough ------------------------------------------

test("prompt: os exemplos anti-passthrough entram SEMPRE, mesmo com memória cheia", () => {
  // Eles corrigem uma falha medida (158 linhas), então não podem ser
  // empurrados pra fora pelos exemplos de tom vindos da memória.
  const memoriaCheia = Array.from({ length: 12 }, (_, i) => ({
    original: `exemplo de memoria ${i}`,
    translation: `traducao de memoria ${i}`,
  }));
  const p = core.buildLlmSystemPrompt([], memoriaCheia, {});
  assert.ok(p.includes("W-Was that Allie?!"), "falta o exemplo de gagueira");
  assert.ok(p.includes("DOST THOU DESIRE THE POWER?"), "falta o exemplo de caixa alta");
  assert.ok(p.includes("Heed my call"), "falta o exemplo de fala entre aspas");
});

test("prompt: a regra de nunca devolver a entrada sem traduzir está escrita", () => {
  const p = core.buildLlmSystemPrompt([], [], {});
  assert.match(p, /NUNCA devolva a entrada sem traduzir/);
});

test("prompt: a regra de formato continua sendo a ÚLTIMA linha (efeito de recência)", () => {
  // já valia antes; as regras novas não podem ter empurrado ela pro meio
  const p = core.buildLlmSystemPrompt([], [], {});
  const linhas = p.split("\n").filter((l) => l.trim());
  assert.match(linhas[linhas.length - 1], /RETORNE EXCLUSIVAMENTE A TRADUÇÃO CRUA/);
});

// ---------------------------------------------------------------------------
// translationFailed: motor falhou, o ORIGINAL foi mantido como tradução
// (ver applyGroupResult no app) — o QA precisa acusar isso como crítico
// mesmo a "tradução" sendo idêntica ao original (que normalmente seria só
// um aviso fraco de "ainda em inglês", não um crítico bloqueante).
// ---------------------------------------------------------------------------

test("makeTranslationFailedIssue: formato básico (crítico, tipo certo)", () => {
  const issue = core.makeTranslationFailedIssue();
  assert.equal(issue.severity, "critical");
  assert.equal(issue.type, "translation-failed");
  assert.ok(issue.detail && issue.detail.length > 0);
});

test("runQualityCheck acusa translation-failed como CRÍTICO quando a flag do doc está marcada", () => {
  const doc = {
    id: 1,
    ignored: {},
    translationFailed: { A1: true },
    entries: [{ ref: "A1", original: "Hello there", lineCount: 1, codes: [], lang: "en" }],
    // o motor falhou: a "tradução" é literalmente o original mantido
    translations: { A1: "Hello there" },
    verified: {},
  };
  const results = core.runQualityCheck([doc], []);
  const item = results.find((r) => r.ref === "A1");
  assert.ok(item, "a linha com falha tem que aparecer no QA");
  assert.ok(
    item.issues.some((i) => i.type === "translation-failed" && i.severity === "critical"),
    "tem que ter o issue translation-failed, e ele tem que ser crítico"
  );
});

test("runQualityCheck NÃO acusa translation-failed quando a flag não está marcada (mesmo com texto igual ao original)", () => {
  const doc = {
    id: 1,
    ignored: {},
    // sem translationFailed: essa linha só cai no aviso normal de "ainda
    // parece estar em inglês" (severidade warning), não no crítico novo
    entries: [{ ref: "A1", original: "Hello there", lineCount: 1, codes: [], lang: "en" }],
    translations: { A1: "Hello there" },
    verified: {},
  };
  const results = core.runQualityCheck([doc], []);
  const item = results.find((r) => r.ref === "A1");
  assert.ok(item);
  assert.ok(!item.issues.some((i) => i.type === "translation-failed"));
});

test("runQualityCheck funciona sem translationFailed definido no doc (compat com doc antigo/migrado)", () => {
  const doc = {
    id: 1,
    ignored: {},
    entries: [{ ref: "A1", original: "Olá", lineCount: 1, codes: [], lang: "pt" }],
    translations: { A1: "Olá" },
    verified: {},
  };
  assert.doesNotThrow(() => core.runQualityCheck([doc], []));
});

test("runQualityCheck: translation-failed sobrevive à aprovação humana (verified), igual aos outros críticos", () => {
  // Mesma regra dos demais críticos: "verificado" só esconde AVISO, nunca
  // crítico — senão uma pessoa poderia aprovar em massa uma leva de linhas
  // com o original mantido sem perceber.
  const doc = {
    id: 1,
    ignored: {},
    translationFailed: { A1: true },
    entries: [{ ref: "A1", original: "Hello there", lineCount: 1, codes: [], lang: "en" }],
    translations: { A1: "Hello there" },
    verified: { A1: true },
  };
  const results = core.runQualityCheck([doc], []);
  const item = results.find((r) => r.ref === "A1");
  assert.ok(item, "crítico não pode sumir mesmo com a linha verificada");
  assert.ok(item.issues.some((i) => i.type === "translation-failed"));
});

test("detectLanguage não marca nome próprio/interjeição curta como pt por coincidência de trigrama", () => {
  // regressão real reportada: nomes de personagem e interjeições curtas
  // (sem palavra reconhecida nem acento) NÃO podem virar "pt" só porque o
  // trigrama bateu por coincidência com a amostra de referência — o certo
  // aqui é "unknown" (nunca some do lote automático) ou, no máximo, "en".
  for (const name of ["Alisa!", "Fie...", "Huh?", "Emma", "Laura"]) {
    const result = core.detectLanguage(name);
    assert.notEqual(result, "pt", `"${name}" não deveria ser marcado "pt" (veio: ${result})`);
  }
});

// ---------------------------------------------------------------------------
// Motor Google AI Studio (Gemini) — mesmo padrão dos testes de
// protectCodes/restoreCodes acima, mas batendo na função real de tradução
// (translateViaGoogle/translateBatchViaGoogle) com fetch mockado, pra
// garantir que o formato de request/response do Gemini (system_instruction,
// contents[].parts[].text, candidates[].content.parts[].text) está
// implementado certo, e que o fix de "código colado" (ver testes de
// protectCodes/restoreCodes) funciona de ponta a ponta por esse motor também.
// ---------------------------------------------------------------------------

function withMockedGeminiFetch(handler, fn) {
  const original = global.fetch;
  global.fetch = handler;
  return fn().finally(() => {
    global.fetch = original;
  });
}

test("translateViaGoogle manda o formato certo da API Gemini e lê a resposta certo", async () => {
  let capturedUrl, capturedBody, capturedHeaders;
  await withMockedGeminiFetch(
    async (url, opts) => {
      capturedUrl = String(url);
      capturedHeaders = opts.headers;
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: "Olá mundo" }] } }] }),
      };
    },
    async () => {
      const settings = { llmProvider: "google", llmApiKey: "AIzaSy-fake", llmModel: "gemini-2.5-flash" };
      const result = await core.translateViaGoogle("Hello world", settings, "system prompt aqui");
      assert.equal(result, "Olá mundo");
    }
  );
  assert.match(capturedUrl, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.5-flash:generateContent$/);
  assert.equal(capturedHeaders["x-goog-api-key"], "AIzaSy-fake");
  assert.equal(capturedBody.system_instruction.parts[0].text, "system prompt aqui");
  assert.equal(capturedBody.contents[0].parts[0].text, "Hello world");
  assert.equal(capturedBody.generationConfig.temperature, 0);
});

test("translateViaGoogle trata chave inválida (403) com mensagem clara", async () => {
  await withMockedGeminiFetch(
    async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: "API key not valid" } }),
    }),
    async () => {
      const settings = { llmProvider: "google", llmApiKey: "chave-errada", llmModel: "gemini-2.5-flash" };
      await assert.rejects(
        () => core.translateViaGoogle("Hello", settings, "sp"),
        /chave de API do Google AI Studio inválida/
      );
    }
  );
});

test("translateBatchViaGoogle pede JSON estruturado e faz o parse da resposta em lote", async () => {
  await withMockedGeminiFetch(
    async (url, opts) => {
      const body = JSON.parse(opts.body);
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      const items = JSON.parse(body.contents[0].parts[0].text).items;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ translations: items.map((t) => "TRAD: " + t) }) }] } }],
        }),
      };
    },
    async () => {
      const settings = { llmProvider: "google", llmApiKey: "AIzaSy-fake", llmModel: "gemini-2.5-flash" };
      const result = await core.translateBatchViaGoogle(["um", "dois"], settings, "sp");
      assert.deepEqual(result, ["TRAD: um", "TRAD: dois"]);
    }
  );
});

test("translateText via motor Google preserva código do jogo e devolve tradução colada quando o original era colado", async () => {
  await withMockedGeminiFetch(
    async (url, opts) => {
      const body = JSON.parse(opts.body);
      const userText = body.contents[0].parts[0].text;
      // "tradutor" fake: só troca "Let's" por "Vamos", mantendo o resto
      // (inclusive o espaço temporário que protectCodes inseriu)
      const translated = userText.replace("Let's", "Vamos");
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: translated }] } }] }),
      };
    },
    async () => {
      const settings = { engine: "llm", llmProvider: "google", llmApiKey: "AIzaSy-fake", llmModel: "gemini-2.5-flash" };
      const result = await core.translateText("#B_0Let's go!", settings, []);
      assert.equal(result, "#B_0Vamos go!", "código tem que voltar colado ao texto, sem o espaço temporário de protectCodes");
    }
  );
});

// ---------------------------------------------------------------------------
// Otimizações de eficiência/qualidade dos motores Google e OpenAI (thinking
// desligado, safetySettings, teto de tokens, schema estrito, few-shot da
// memória de tradução).
// ---------------------------------------------------------------------------

test("googleThinkingConfig desliga o thinking em modelos flash, mas NÃO em modelos -pro", () => {
  assert.deepEqual(core.googleThinkingConfig("gemini-2.5-flash"), { thinkingConfig: { thinkingBudget: 0 } });
  assert.deepEqual(core.googleThinkingConfig("gemini-2.5-flash-lite"), { thinkingConfig: { thinkingBudget: 0 } });
  assert.deepEqual(core.googleThinkingConfig("gemini-2.5-pro"), {});
  assert.deepEqual(core.googleThinkingConfig("gemini-3.1-pro-preview"), {});
});

test("pickFewShotExamples só usa entradas verificadas, ordena por mais recente e ignora frases curtas/longas demais", () => {
  const now = Date.now();
  const memory = {
    "Oi": { translation: "Oi", verified: true, updatedAt: now }, // curta demais (<8 chars), fora
    "Hello there, how have you been lately?": { translation: "Olá, como você tem passado ultimamente?", verified: true, updatedAt: now - 1000 },
    "Rascunho não revisado ainda pelo usuário": { translation: "sugestão automática", verified: false, updatedAt: now }, // não verificada, fora
    "Watch your back out there, the road gets dangerous past this point": { translation: "Fique de olho, o caminho fica perigoso depois daqui", verified: true, updatedAt: now - 500 },
    ["x".repeat(200)]: { translation: "y".repeat(200), verified: true, updatedAt: now }, // longa demais (>140 chars), fora
  };
  const examples = core.pickFewShotExamples(memory, 3);
  assert.equal(examples.length, 2, "só as 2 entradas verificadas com tamanho ok deveriam entrar");
  // mais recente (updatedAt maior) primeiro
  assert.equal(examples[0].original, "Watch your back out there, the road gets dangerous past this point");
  assert.equal(examples[1].original, "Hello there, how have you been lately?");
});

test("pickFewShotExamples não quebra com memória vazia/indefinida", () => {
  assert.deepEqual(core.pickFewShotExamples({}), []);
  assert.deepEqual(core.pickFewShotExamples(undefined), []);
  assert.deepEqual(core.pickFewShotExamples(null), []);
});

test("buildLlmSystemPrompt inclui os exemplos few-shot quando fornecidos", () => {
  const withExamples = core.buildLlmSystemPrompt([], [{ original: "Hello", translation: "Olá" }]);
  assert.match(withExamples, /Exemplos de tom e registro/);
  assert.match(withExamples, /"Hello" → "Olá"/, "o exemplo da memória do projeto tem que aparecer");

  // Sem memória, os exemplos FIXOS entram no lugar: no começo de um projeto
  // a memória está vazia, e é justamente aí que o modelo mais precisa de
  // referência de registro. Antes ele ficava sem exemplo nenhum.
  const semMemoria = core.buildLlmSystemPrompt([], []);
  assert.match(semMemoria, /Exemplos de tom e registro/);
  assert.match(semMemoria, /Hmpf/, "exemplo fixo de interjeição");
  assert.match(semMemoria, /Mas se a gente não—/, "exemplo fixo de frase cortada");
});

test("translateViaGoogle manda thinkingConfig, safetySettings e maxOutputTokens no request", async () => {
  let capturedBody;
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }) };
  };
  try {
    const settings = { llmProvider: "google", llmApiKey: "AIzaSy-fake", llmModel: "gemini-2.5-flash" };
    await core.translateViaGoogle("Hello", settings, "sp");
  } finally {
    global.fetch = original;
  }
  assert.deepEqual(capturedBody.generationConfig.thinkingConfig, { thinkingBudget: 0 });
  assert.equal(capturedBody.generationConfig.maxOutputTokens, 1024);
  assert.ok(Array.isArray(capturedBody.safetySettings) && capturedBody.safetySettings.length === 4);
});

test("translateBatchViaOpenAI usa json_schema estrito no endpoint oficial, mas json_object simples em endpoint customizado", async () => {
  let capturedOfficial, capturedCustom;
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (String(url).includes("api.openai.com")) capturedOfficial = body;
    else capturedCustom = body;
    const items = JSON.parse(body.messages[1].content).items;
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ translations: items.map((t) => "T:" + t) }) } }] }),
    };
  };
  try {
    const officialSettings = { llmProvider: "openai", llmApiKey: "sk-fake", llmModel: "gpt-4o-mini" };
    await core.translateBatchViaOpenAI(["a", "b"], officialSettings, "sp");

    const customSettings = { llmProvider: "openai", llmApiKey: "ollama", llmModel: "qwen2.5:14b", openaiBaseUrl: "http://localhost:11434/v1/chat/completions" };
    await core.translateBatchViaOpenAI(["a", "b"], customSettings, "sp");
  } finally {
    global.fetch = original;
  }
  assert.equal(capturedOfficial.response_format.type, "json_schema");
  assert.equal(capturedOfficial.response_format.json_schema.strict, true);
  assert.equal(capturedCustom.response_format.type, "json_object");
});

// ---------------------------------------------------------------------------
// Correção do erro "limite de requisições/cota do Google AI Studio atingido"
// reportado em produção: o Gemini manda o tempo de espera real DENTRO do
// corpo do erro 429 (google.rpc.RetryInfo.retryDelay), não no header HTTP
// Retry-After — sem ler isso a gente tentava de novo cedo demais e batia na
// cota outra vez. Também distingue cota por-MINUTO (vale tentar de novo) de
// cota DIÁRIA (não adianta insistir na mesma sessão).
// ---------------------------------------------------------------------------

test("parseGoogleQuotaError lê o retryDelay do RetryInfo (limite por minuto, recuperável)", () => {
  const errBody = {
    error: {
      code: 429,
      status: "RESOURCE_EXHAUSTED",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.QuotaFailure",
          violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", quotaValue: "10" }],
        },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "34s" },
      ],
    },
  };
  const result = core.parseGoogleQuotaError(errBody);
  assert.equal(result.retryAfterMs, 34000);
  assert.equal(result.isDailyQuota, false);
});

test("parseGoogleQuotaError detecta cota DIÁRIA esgotada (quotaId com PerDay)", () => {
  const errBody = {
    error: {
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.QuotaFailure",
          violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue: "50" }],
        },
      ],
    },
  };
  const result = core.parseGoogleQuotaError(errBody);
  assert.equal(result.isDailyQuota, true);
});

test("parseGoogleQuotaError não quebra com corpo de erro ausente/malformado", () => {
  assert.deepEqual(core.parseGoogleQuotaError(null), { retryAfterMs: null, isDailyQuota: false });
  assert.deepEqual(core.parseGoogleQuotaError({}), { retryAfterMs: null, isDailyQuota: false });
  assert.deepEqual(core.parseGoogleQuotaError({ error: {} }), { retryAfterMs: null, isDailyQuota: false });
});

test("computeBackoffDelay respeita um retryAfterMs de servidor maior que 30s (não trunca mais em 30s)", () => {
  const delay = core.computeBackoffDelay(0, 34000);
  assert.ok(delay >= 34000 && delay < 34300, `esperava ~34000-34300ms, veio ${delay}`);
});

test("computeBackoffDelay ainda tem um teto (65s) pra não esperar tempo absurdo", () => {
  const delay = core.computeBackoffDelay(0, 999999);
  assert.ok(delay <= 65300, `não deveria passar de ~65s, veio ${delay}`);
});

test("translateViaGoogle: 429 com cota por minuto vem com retryable=true e retryAfterMs do servidor", async () => {
  const original = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 429,
    json: async () => ({
      error: {
        status: "RESOURCE_EXHAUSTED",
        message: "Resource has been exhausted.",
        details: [
          { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }] },
          { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "12s" },
        ],
      },
    }),
  });
  try {
    const settings = { llmProvider: "google", llmApiKey: "AIzaSy-fake", llmModel: "gemini-2.5-flash" };
    await assert.rejects(() => core.translateViaGoogle("Hello", settings, "sp"), (err) => {
      assert.equal(err.retryable, true);
      assert.equal(err.retryAfterMs, 12000);
      return true;
    });
  } finally {
    global.fetch = original;
  }
});

test("translateViaGoogle: 429 de cota DIÁRIA vem com retryable=false (não adianta insistir na mesma sessão)", async () => {
  const original = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 429,
    json: async () => ({
      error: {
        status: "RESOURCE_EXHAUSTED",
        message: "Resource has been exhausted.",
        details: [
          { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] },
        ],
      },
    }),
  });
  try {
    const settings = { llmProvider: "google", llmApiKey: "AIzaSy-fake", llmModel: "gemini-2.5-flash" };
    await assert.rejects(() => core.translateViaGoogle("Hello", settings, "sp"), (err) => {
      assert.equal(err.retryable, false);
      assert.match(err.message, /cota DIÁRIA/);
      return true;
    });
  } finally {
    global.fetch = original;
  }
});

test("llmPacingFor: Google usa 1 requisição por vez e mais espaçada; Anthropic mantém 2", () => {
  const google = core.llmPacingFor("google");
  assert.equal(google.concurrency, 1);
  assert.ok(google.paceMs >= 1000);

  const anthropic = core.llmPacingFor("anthropic");
  assert.equal(anthropic.concurrency, 2);

  // A OpenAI oficial subiu de 2 pra 4 de propósito (limites de RPM folgados
  // já no tier pago inicial) — coberto em detalhe no teste de calibragem
  // por provedor E endpoint, mais abaixo.
  const openai = core.llmPacingFor("openai");
  assert.equal(openai.concurrency, 4);
});

// ---------------------------------------------------------------------------
// Prompt caching da Anthropic — o prompt de sistema (regras + glossário +
// few-shot) é idêntico em toda chamada da mesma sessão; marcar com
// cache_control corta o custo dessa parte em até 90% nas chamadas repetidas
// (cache hit), sem mudar nada na tradução em si (mesmo texto, mesmo prompt).
// ---------------------------------------------------------------------------

test("buildAnthropicSystemBlocks envolve o prompt de sistema no formato de cache_control ephemeral", () => {
  const blocks = core.buildAnthropicSystemBlocks("Você traduz diálogos...");
  assert.deepEqual(blocks, [{ type: "text", text: "Você traduz diálogos...", cache_control: { type: "ephemeral" } }]);
});

test("translateViaAnthropic manda o system como bloco com cache_control (não mais string simples)", async () => {
  let capturedBody;
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "Olá" }] }) };
  };
  try {
    const settings = { llmProvider: "anthropic", llmApiKey: "sk-ant-fake", llmModel: "claude-sonnet-5" };
    await core.translateViaAnthropic("Hello", settings, "prompt de sistema aqui");
  } finally {
    global.fetch = original;
  }
  assert.ok(Array.isArray(capturedBody.system), "system deveria ser um array de blocos, não string");
  assert.equal(capturedBody.system[0].type, "text");
  assert.equal(capturedBody.system[0].text, "prompt de sistema aqui");
  assert.deepEqual(capturedBody.system[0].cache_control, { type: "ephemeral" });
});

test("translateBatchViaAnthropic também manda o system com cache_control", async () => {
  let capturedBody;
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    const items = JSON.parse(capturedBody.messages[0].content).items;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "tool_use", name: "submit_translations", input: { translations: items.map((t) => "T:" + t) } }],
      }),
    };
  };
  try {
    const settings = { llmProvider: "anthropic", llmApiKey: "sk-ant-fake", llmModel: "claude-sonnet-5" };
    await core.translateBatchViaAnthropic(["um", "dois"], settings, "prompt de sistema aqui");
  } finally {
    global.fetch = original;
  }
  assert.ok(Array.isArray(capturedBody.system));
  assert.deepEqual(capturedBody.system[0].cache_control, { type: "ephemeral" });
});

// ---------------------------------------------------------------------------
// Auditoria 1.2: batch da Anthropic usa tool use FORÇADO (garantia
// estrutural da API), em vez de só pedir JSON por instrução em texto — a
// única das 3 integrações que não tinha esse tipo de garantia (OpenAI já
// usa response_format json_schema strict, Google já usa responseSchema).
// ---------------------------------------------------------------------------

test("translateBatchViaAnthropic manda tools + tool_choice forçando a ferramenta submit_translations", async () => {
  let capturedBody;
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    const items = JSON.parse(capturedBody.messages[0].content).items;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "tool_use", name: "submit_translations", input: { translations: items.map((t) => "T:" + t) } }],
      }),
    };
  };
  try {
    const settings = { llmProvider: "anthropic", llmApiKey: "sk-ant-fake", llmModel: "claude-sonnet-5" };
    const result = await core.translateBatchViaAnthropic(["a", "b", "c"], settings, "sp");
    assert.deepEqual(result, ["T:a", "T:b", "T:c"]);
  } finally {
    global.fetch = original;
  }
  assert.equal(capturedBody.tool_choice.type, "tool");
  assert.equal(capturedBody.tool_choice.name, "submit_translations");
  assert.equal(capturedBody.tools[0].name, "submit_translations");
  assert.deepEqual(capturedBody.tools[0].input_schema.required, ["translations"]);
});

test("translateBatchViaAnthropic: resposta sem bloco tool_use (modelo respondeu só texto) é tratada como falha, não como sucesso vazio", async () => {
  const original = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: "text", text: "Desculpe, não posso ajudar com isso." }] }),
  });
  try {
    const settings = { llmProvider: "anthropic", llmApiKey: "sk-ant-fake", llmModel: "claude-sonnet-5" };
    await assert.rejects(
      () => core.translateBatchViaAnthropic(["a", "b"], settings, "sp"),
      /sem chamada de ferramenta/
    );
  } finally {
    global.fetch = original;
  }
});

test("translateBatchViaAnthropic: tamanho errado no tool_use ainda é rejeitado (mesma validação de sempre)", async () => {
  const original = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: "tool_use", name: "submit_translations", input: { translations: ["só um"] } }] }),
  });
  try {
    const settings = { llmProvider: "anthropic", llmApiKey: "sk-ant-fake", llmModel: "claude-sonnet-5" };
    await assert.rejects(() => core.translateBatchViaAnthropic(["a", "b"], settings, "sp"), /esperava 2/);
  } finally {
    global.fetch = original;
  }
});

test("extractAnthropicToolInput acha o bloco certo mesmo com thinking antes dele, e ignora tool_use de outro nome", () => {
  const content = [
    { type: "thinking", thinking: "..." },
    { type: "tool_use", name: "outra_ferramenta", input: { x: 1 } },
    { type: "tool_use", name: "submit_translations", input: { translations: ["x", "y"] } },
  ];
  assert.deepEqual(core.extractAnthropicToolInput(content, "submit_translations"), { translations: ["x", "y"] });
  assert.equal(core.extractAnthropicToolInput(null, "submit_translations"), null);
  assert.equal(core.extractAnthropicToolInput([{ type: "text", text: "x" }], "submit_translations"), null);
});

test("validateBatchTranslationsArray: converte itens não-string e rejeita tamanho/tipo errado", () => {
  assert.deepEqual(core.validateBatchTranslationsArray(["a", 1, null], 3), ["a", "1", ""]);
  assert.throws(() => core.validateBatchTranslationsArray(["a"], 2), /esperava 2/);
  assert.throws(() => core.validateBatchTranslationsArray("não é array", 1));
});

// ---------------------------------------------------------------------------
// Qualidade da tradução com Claude Haiku: extended thinking automático,
// extração robusta do bloco de texto (o content[0] deixa de ser o texto
// quando thinking está ligado — vira um bloco de raciocínio antes dele),
// e mais exemplos few-shot pro modelo menor.
// ---------------------------------------------------------------------------

test("anthropicThinkingConfig só liga pra modelos Haiku, com orçamento mínimo válido (1024)", () => {
  assert.deepEqual(core.anthropicThinkingConfig("claude-haiku-4-5-20251001"), { thinking: { type: "enabled", budget_tokens: 1024 } });
  assert.deepEqual(core.anthropicThinkingConfig("claude-3-5-haiku-latest"), { thinking: { type: "enabled", budget_tokens: 1024 } });
  assert.deepEqual(core.anthropicThinkingConfig("claude-sonnet-5"), {});
  assert.deepEqual(core.anthropicThinkingConfig("claude-opus-5"), {});
  assert.deepEqual(core.anthropicThinkingConfig(""), {});
  assert.deepEqual(core.anthropicThinkingConfig(undefined), {});
});

test("extractAnthropicText acha o bloco de texto mesmo com blocos de thinking antes dele", () => {
  const withThinking = [
    { type: "thinking", thinking: "deixa eu analisar o registro de fala aqui...", signature: "abc" },
    { type: "text", text: "Tradução final aqui" },
  ];
  assert.equal(core.extractAnthropicText(withThinking), "Tradução final aqui");

  // sem thinking, continua funcionando (comportamento de antes)
  assert.equal(core.extractAnthropicText([{ type: "text", text: "Sem thinking" }]), "Sem thinking");

  // nada de texto -> null (chamador já trata como resposta vazia/inválida)
  assert.equal(core.extractAnthropicText([{ type: "thinking", thinking: "só pensou, não respondeu" }]), null);
  assert.equal(core.extractAnthropicText(null), null);
  assert.equal(core.extractAnthropicText(undefined), null);
});

test("fewShotCountFor pede mais exemplos (5) pro Haiku, mantém 3 pros outros modelos/provedores", () => {
  assert.equal(core.fewShotCountFor({ llmProvider: "anthropic", llmModel: "claude-haiku-4-5-20251001" }), 5);
  assert.equal(core.fewShotCountFor({ llmProvider: "anthropic", llmModel: "claude-sonnet-5" }), 3);
  assert.equal(core.fewShotCountFor({ llmProvider: "openai", llmModel: "gpt-haiku-nao-existe" }), 3); // "haiku" só conta pra Anthropic
  assert.equal(core.fewShotCountFor({ llmProvider: "google", llmModel: "gemini-2.5-flash" }), 3);
  assert.equal(core.fewShotCountFor({}), 3);
});

test("translateViaAnthropic com modelo Haiku: manda thinking, OMITE temperature, e sobe max_tokens acima do budget", async () => {
  let capturedBody;
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          { type: "thinking", thinking: "pensando...", signature: "sig" },
          { type: "text", text: "Olá mundo" },
        ],
      }),
    };
  };
  try {
    const settings = { llmProvider: "anthropic", llmApiKey: "sk-ant-fake", llmModel: "claude-haiku-4-5-20251001" };
    const result = await core.translateViaAnthropic("Hello world", settings, "sp");
    assert.equal(result, "Olá mundo", "deveria extrair o texto final, não o bloco de thinking");
  } finally {
    global.fetch = original;
  }
  assert.deepEqual(capturedBody.thinking, { type: "enabled", budget_tokens: 1024 });
  assert.equal("temperature" in capturedBody, false, "temperature não pode ir junto quando thinking está ligado (API rejeita)");
  assert.ok(capturedBody.max_tokens > 1024, "max_tokens precisa ficar ACIMA do budget_tokens do thinking");
});

test("translateViaAnthropic com modelo Sonnet (sem Haiku): não manda thinking, mantém temperature 0", async () => {
  let capturedBody;
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "Olá" }] }) };
  };
  try {
    const settings = { llmProvider: "anthropic", llmApiKey: "sk-ant-fake", llmModel: "claude-sonnet-5" };
    await core.translateViaAnthropic("Hello", settings, "sp");
  } finally {
    global.fetch = original;
  }
  assert.equal("thinking" in capturedBody, false);
  assert.equal(capturedBody.temperature, 0);
  assert.equal(capturedBody.max_tokens, 1024);
});

// ---------------------------------------------------------------------------
// Motor LibreTranslate: correção da colagem no glossário de termos (mesmo
// bug do protectCodes, agora em protectProperNouns) e paridade de retry/
// backoff com os outros motores.
// ---------------------------------------------------------------------------

test("protectProperNouns/restoreProperNouns: termo do glossário colado a pontuação/palavra volta colado", () => {
  const nouns = [{ term: "Rean", translation: "Rean" }];
  const { text, tokens } = core.protectProperNouns("Rean's sword is broken.", nouns);
  assert.match(text, /¤0¤/);
  const restored = core.restoreProperNouns(text, tokens);
  assert.equal(restored, "Rean's sword is broken.", "não pode sobrar espaço entre o termo e o apóstrofo colado");
});

test("protectProperNouns/restoreProperNouns: usa a tradução fixa do glossário quando definida, mantendo a colagem", () => {
  const nouns = [{ term: "Old Schoolhouse", translation: "Antigo Educandário" }];
  const { text, tokens } = core.protectProperNouns("Welcome to the Old Schoolhouse!", nouns);
  const restored = core.restoreProperNouns(text, tokens);
  assert.equal(restored, "Welcome to the Antigo Educandário!", "termo colado no '!' tem que voltar colado, com a tradução certa");
});

test("protectProperNouns/restoreProperNouns: termo já cercado de espaços não ganha nem perde espaço", () => {
  const nouns = [{ term: "Rean", translation: "Rean" }];
  const { text, tokens } = core.protectProperNouns("Hi, Rean, how are you?", nouns);
  const restored = core.restoreProperNouns(text, tokens);
  assert.equal(restored, "Hi, Rean, how are you?");
});

test("protectProperNouns: sem termo com tradução fixa, mantém o termo original tal como apareceu", () => {
  const nouns = [{ term: "Rean", translation: "" }];
  const { text, tokens } = core.protectProperNouns("Rean smiled.", nouns);
  const restored = core.restoreProperNouns(text, tokens);
  assert.equal(restored, "Rean smiled.");
});

test("restoreProperNouns aceita tokens no formato antigo (string) como fallback", () => {
  // formato antigo, de antes da correção — não pode quebrar se algo em voo
  // (ou um teste externo) ainda passar tokens como array de strings puras
  const restored = core.restoreProperNouns("¤0¤ Test", ["Rean"]);
  assert.equal(restored, "Rean Test");
});

test("translateViaLibreTranslate: erro 503 vem marcado retryable com retryAfterMs do header", async () => {
  const original = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 503,
    headers: { get: (h) => (h.toLowerCase() === "retry-after" ? "5" : null) },
    json: async () => ({ error: "server overloaded" }),
  });
  try {
    const settings = { ltEndpoint: "http://localhost:5000/translate" };
    await assert.rejects(() => core.translateViaLibreTranslate("Hello", settings), (err) => {
      assert.equal(err.retryable, true);
      assert.equal(err.retryAfterMs, 5000);
      return true;
    });
  } finally {
    global.fetch = original;
  }
});

test("translateViaLibreTranslate: HTTP 200 com translatedText vazio é tratado como falha (não fica \"tradução\" em branco)", async () => {
  const original = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ translatedText: "" }),
  });
  try {
    const settings = { ltEndpoint: "http://localhost:5000/translate" };
    await assert.rejects(() => core.translateViaLibreTranslate("Hello", settings), /vazia\/inválida/);
  } finally {
    global.fetch = original;
  }
});

test("translateViaLibreTranslate: erro de rede não é confundido com resposta bem-sucedida", async () => {
  const original = global.fetch;
  global.fetch = async () => { throw new Error("ECONNREFUSED"); };
  try {
    const settings = { ltEndpoint: "http://localhost:5000/translate" };
    await assert.rejects(() => core.translateViaLibreTranslate("Hello", settings), /não consegui falar com o LibreTranslate/);
  } finally {
    global.fetch = original;
  }
});

// ---------------------------------------------------------------------------
// Aprovar em lote (botão "Aprovar tudo traduzido" no arquivo atual) —
// selectBulkApprovableEntries decide quais linhas entram, com as mesmas 2
// travas do botão "aprovar" de cada cartão: nunca aprova linha vazia, e
// NUNCA aprova linha com problema crítico de QA (código do jogo ausente/
// alterado), mesmo em lote.
// ---------------------------------------------------------------------------

function makeApproveTestDoc(overrides = {}) {
  return {
    id: 1,
    fileName: "a0000.xlsx",
    ignored: {},
    verified: {},
    translations: {},
    entries: [],
    ...overrides,
  };
}

test("selectBulkApprovableEntries aprova linhas traduzidas, pulando vazias e já verificadas", () => {
  const doc = makeApproveTestDoc({
    entries: [
      { ref: "A1", original: "Hello", lineCount: 1, codes: [] },
      { ref: "A2", original: "World", lineCount: 1, codes: [] },
      { ref: "A3", original: "Sem tradução ainda", lineCount: 1, codes: [] },
    ],
    translations: { A1: "Olá", A2: "Mundo" },
    verified: { A2: true }, // já aprovada antes
  });
  const result = core.selectBulkApprovableEntries(doc, []);
  assert.equal(result.toApprove.length, 1);
  assert.equal(result.toApprove[0].ref, "A1");
  assert.equal(result.alreadyVerified, 1);
  assert.equal(result.stillEmpty, 1);
  assert.equal(result.skippedCritical, 0);
});

test("selectBulkApprovableEntries NUNCA aprova linha com código do jogo ausente (crítico), mesmo em lote", () => {
  const doc = makeApproveTestDoc({
    entries: [
      { ref: "A1", original: "#E[1] Hello world", lineCount: 1, codes: ["#E[1]"] },
      { ref: "A2", original: "Goodbye", lineCount: 1, codes: [] },
    ],
    // A1 perdeu o código #E[1] na tradução -> crítico; A2 está ok
    translations: { A1: "Olá mundo", A2: "Tchau" },
  });
  const result = core.selectBulkApprovableEntries(doc, []);
  assert.equal(result.toApprove.length, 1);
  assert.equal(result.toApprove[0].ref, "A2");
  assert.equal(result.skippedCritical, 1);
});

test("selectBulkApprovableEntries NUNCA aprova linha marcada como translationFailed (motor falhou, original mantido)", () => {
  const doc = {
    entries: [{ ref: "A1", original: "Hello there", lineCount: 1, codes: [], lang: "en" }],
    ignored: {},
    verified: {},
    translations: { A1: "Hello there" },
    translationFailed: { A1: true },
  };
  const result = core.selectBulkApprovableEntries(doc, []);
  assert.equal(result.toApprove.length, 0, "não pode entrar na aprovação em massa — é o original mantido, não uma tradução");
  assert.equal(result.skippedCritical, 1);
});

test("selectBulkApprovableEntries pula linha ignorada", () => {
  const doc = makeApproveTestDoc({
    entries: [{ ref: "A1", original: "Hello", lineCount: 1, codes: [] }],
    translations: { A1: "Olá" },
    ignored: { A1: true },
  });
  const result = core.selectBulkApprovableEntries(doc, []);
  assert.equal(result.toApprove.length, 0);
});

test("selectBulkApprovableEntries: arquivo com tudo já aprovado devolve lista vazia sem contar como crítico/vazio", () => {
  const doc = makeApproveTestDoc({
    entries: [{ ref: "A1", original: "Hello", lineCount: 1, codes: [] }],
    translations: { A1: "Olá" },
    verified: { A1: true },
  });
  const result = core.selectBulkApprovableEntries(doc, []);
  assert.equal(result.toApprove.length, 0);
  assert.equal(result.alreadyVerified, 1);
  assert.equal(result.skippedCritical, 0);
  assert.equal(result.stillEmpty, 0);
});

// ---------------------------------------------------------------------------
// entryMatchesFilter — regra única usada tanto pela lista do arquivo ativo
// quanto pela busca no projeto inteiro (chip de status + texto/célula/
// location). Extraída pra não duplicar essa lógica entre os dois modos.
// ---------------------------------------------------------------------------

function makeSearchTestDoc(overrides = {}) {
  return {
    id: 1,
    fileName: "a0000.xlsx",
    ignored: {},
    verified: {},
    translations: {},
    ...overrides,
  };
}

test("memoryKey normaliza o texto (trim) usado como chave da memória", () => {
  assert.equal(core.memoryKey("  Hello world  "), "Hello world");
});

test("entryMatchesFilter: filtro 'pending' só deixa passar linha sem tradução e não verificada", () => {
  const doc = makeSearchTestDoc({ translations: { A1: "Olá" }, verified: { A2: true } });
  const pending = { ref: "A3", location: "L1", original: "Not done" };
  const done = { ref: "A1", location: "L1", original: "Hello" };
  const verified = { ref: "A2", location: "L1", original: "World" };
  assert.equal(core.entryMatchesFilter(doc, pending, "pending", "", null), true);
  assert.equal(core.entryMatchesFilter(doc, done, "pending", "", null), false);
  assert.equal(core.entryMatchesFilter(doc, verified, "pending", "", null), false);
});

test("entryMatchesFilter: filtro 'done' exclui o que já foi verificado (só traduzido-não-revisado)", () => {
  const doc = makeSearchTestDoc({ translations: { A1: "Olá", A2: "Mundo" }, verified: { A2: true } });
  const done = { ref: "A1", location: "L1", original: "Hello" };
  const verified = { ref: "A2", location: "L1", original: "World" };
  assert.equal(core.entryMatchesFilter(doc, done, "done", "", null), true);
  assert.equal(core.entryMatchesFilter(doc, verified, "done", "", null), false);
});

test("entryMatchesFilter: filtro 'verified' só deixa passar o que está marcado como verificado", () => {
  const doc = makeSearchTestDoc({ translations: { A1: "Olá" }, verified: { A1: true } });
  const e = { ref: "A1", location: "L1", original: "Hello" };
  assert.equal(core.entryMatchesFilter(doc, e, "verified", "", null), true);
  assert.equal(core.entryMatchesFilter(doc, e, "pending", "", null), false);
});

test("entryMatchesFilter: linha ignorada só aparece nos filtros 'ignored' e 'all'", () => {
  const doc = makeSearchTestDoc({ ignored: { A1: true } });
  const e = { ref: "A1", location: "L1", original: "Hello" };
  assert.equal(core.entryMatchesFilter(doc, e, "ignored", "", null), true);
  assert.equal(core.entryMatchesFilter(doc, e, "all", "", null), true);
  assert.equal(core.entryMatchesFilter(doc, e, "pending", "", null), false);
  assert.equal(core.entryMatchesFilter(doc, e, "done", "", null), false);
});

test("entryMatchesFilter: busca (q) casa por célula, location OU texto original — case-insensitive", () => {
  const doc = makeSearchTestDoc();
  const e = { ref: "B7", location: "Vila de Nord", original: "Watch your back out there" };
  assert.equal(core.entryMatchesFilter(doc, e, "all", "b7", null), true, "deveria casar pela célula");
  assert.equal(core.entryMatchesFilter(doc, e, "all", "nord", null), true, "deveria casar pela location");
  assert.equal(core.entryMatchesFilter(doc, e, "all", "watch your", null), true, "deveria casar pelo texto original");
  assert.equal(core.entryMatchesFilter(doc, e, "all", "não existe nada disso", null), false);
});

test("entryMatchesFilter: filtro de status e busca de texto se combinam (E lógico, não OU)", () => {
  const doc = makeSearchTestDoc({ translations: { A1: "Olá" } }); // A1 traduzido, não verificado
  const match = { ref: "A1", location: "L1", original: "Hello world" };
  // bate a busca, mas não bate o filtro "pending" (já tem tradução)
  assert.equal(core.entryMatchesFilter(doc, match, "pending", "hello", null), false);
  // bate a busca E o filtro "done"
  assert.equal(core.entryMatchesFilter(doc, match, "done", "hello", null), true);
});

test("entryMatchesFilter: usado num projeto com vários arquivos, cada doc mantém seu próprio status (não vaza entre arquivos)", () => {
  const docA = makeSearchTestDoc({ id: 1, translations: { A1: "Olá" } }); // traduzido em A
  const docB = makeSearchTestDoc({ id: 2, translations: {} }); // mesmo ref, ainda pendente em B
  const entryA = { ref: "A1", location: "L1", original: "Watch your back" };
  const entryB = { ref: "A1", location: "L1", original: "Watch your back" };
  const q = "watch";
  // simula uma varredura de busca no projeto inteiro: cada doc usa SEU
  // próprio mapa de traduções/verified, não o de outro arquivo
  const resultsDone = [docA, docB]
    .map((doc, i) => ({ doc, e: [entryA, entryB][i] }))
    .filter(({ doc, e }) => core.entryMatchesFilter(doc, e, "done", q, null));
  assert.equal(resultsDone.length, 1);
  assert.equal(resultsDone[0].doc.id, 1);

  const resultsPending = [docA, docB]
    .map((doc, i) => ({ doc, e: [entryA, entryB][i] }))
    .filter(({ doc, e }) => core.entryMatchesFilter(doc, e, "pending", q, null));
  assert.equal(resultsPending.length, 1);
  assert.equal(resultsPending[0].doc.id, 2);
});

// ---------------------------------------------------------------------------
// Auditoria 2.1: checkEntryIssues agora conta OCORRÊNCIAS de cada código,
// não só presença — pega o caso de um código que aparece 2x no original e
// só 1x (ou 0x) na tradução, que o .includes() antigo deixava passar.
// ---------------------------------------------------------------------------

test("checkEntryIssues: código que aparece 2x no original mas só 1x na tradução é CRÍTICO (antes passava batido)", () => {
  const entry = { original: "#K Olá #K mundo", lineCount: 1, codes: core.extractCodes("#K Olá #K mundo") };
  assert.deepEqual(entry.codes, ["#K", "#K"]);
  // tradução perdeu UMA das duas ocorrências de #K
  const issues = core.checkEntryIssues(entry, "#K Hello world", []);
  const critical = issues.filter((i) => i.severity === "critical");
  assert.equal(critical.length, 1, "deveria detectar que sobrou só 1 de 2 ocorrências de #K");
  assert.match(critical[0].detail, /#K \(1\/2x\)/);
});

test("checkEntryIssues: código duplicado presente nas MESMAS quantidades não é crítico", () => {
  const entry = { original: "#K Olá #K mundo", lineCount: 1, codes: core.extractCodes("#K Olá #K mundo") };
  const issues = core.checkEntryIssues(entry, "#K Hi #K world", []);
  assert.equal(issues.filter((i) => i.severity === "critical").length, 0);
});

test("checkEntryIssues: continua detectando código totalmente ausente (regressão do comportamento antigo)", () => {
  const entry = { original: "#E[1] Hello world", lineCount: 1, codes: core.extractCodes("#E[1] Hello world") };
  const issues = core.checkEntryIssues(entry, "Olá mundo", []);
  const critical = issues.filter((i) => i.severity === "critical");
  assert.equal(critical.length, 1);
  assert.match(critical[0].detail, /#E\[1\]/);
});

test("countOccurrences conta substrings não-sobrepostas corretamente", () => {
  assert.equal(core.countOccurrences("#K a #K b #K c", "#K"), 3);
  assert.equal(core.countOccurrences("nada aqui", "#K"), 0);
  assert.equal(core.countOccurrences("aaaa", "aa"), 2); // não-sobreposto: aa|aa, não aa-a-a
});

// ---------------------------------------------------------------------------
// Auditoria 2.2: protectPunctuation/restorePunctuation ganham o mesmo
// glueBefore/glueAfter que protectCodes e protectProperNouns já tinham —
// pontuação colada numa palavra vizinha tem que voltar colada.
// ---------------------------------------------------------------------------

test("protectPunctuation + restorePunctuation: ida-e-volta perfeita mesmo com pontuação colada em palavra", () => {
  const casos = [
    "Wait... I need to think.",
    "(thinking) I should go.",
    "Reticências no fim…",
    "Isso é (muito) importante...",
  ];
  for (const original of casos) {
    const { protectedText, tokens } = core.protectPunctuation(original);
    const restored = core.restorePunctuation(protectedText, tokens);
    assert.equal(restored, original, `falhou para: ${original}`);
  }
});

test("protectPunctuation: marca glueBefore/glueAfter quando reticências/parênteses estão colados sem espaço", () => {
  const { protectedText, tokens } = core.protectPunctuation("Wait...I go.");
  assert.equal(tokens[0].glueBefore, true, "colado em 'Wait' sem espaço");
  assert.equal(tokens[0].glueAfter, true, "colado em 'I' sem espaço");
  assert.match(protectedText, /Wait ‡0‡ I go\./);
});

test("restorePunctuation: remove espaço extra que o motor de tradução tenha adicionado, quando o original era colado", () => {
  const { protectedText, tokens } = core.protectPunctuation("Wait...I go.");
  // simula um motor de tradução que devolveu com espaço a mais ao redor do marcador
  const fakeTranslated = protectedText.replace("Wait ‡0‡ I", "Wait   ‡0‡   I");
  const restored = core.restorePunctuation(fakeTranslated, tokens);
  assert.equal(restored, "Wait...I go.");
});

test("restorePunctuation aceita tokens no formato antigo (string) como fallback", () => {
  const restored = core.restorePunctuation("Test ‡0‡ done", ["..."]);
  assert.equal(restored, "Test ... done");
});

// ---------------------------------------------------------------------------
// Auditoria 1.1: translateText/translateBatchWithRetry falham rápido quando
// o erro já vem marcado retryable:false (chave inválida, cota diária) — não
// insistem 2-3x à toa num erro que não vai se resolver tentando de novo.
// ---------------------------------------------------------------------------

test("translateText: NÃO faz retry quando o erro vem com retryable:false (falha na 1ª tentativa)", async () => {
  let calls = 0;
  const original = global.fetch;
  global.fetch = async () => {
    calls += 1;
    return {
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "invalid api key" } }),
    };
  };
  try {
    const settings = { engine: "llm", llmProvider: "anthropic", llmApiKey: "sk-ant-invalida", llmModel: "claude-sonnet-5" };
    await assert.rejects(() => core.translateText("Hello", settings, []));
  } finally {
    global.fetch = original;
  }
  assert.equal(calls, 1, "chave inválida (401) não deveria disparar retry — só 1 chamada de rede no total");
});

test("translateText: continua fazendo retry normalmente em erro retryable (429 genérico)", async () => {
  let calls = 0;
  const original = global.fetch;
  global.fetch = async () => {
    calls += 1;
    if (calls < 2) {
      return { ok: false, status: 429, headers: { get: () => null }, json: async () => ({ error: { message: "rate limited" } }) };
    }
    return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "Olá" }] }) };
  };
  try {
    const settings = { engine: "llm", llmProvider: "anthropic", llmApiKey: "sk-ant-fake", llmModel: "claude-sonnet-5" };
    const result = await core.translateText("Hello", settings, []);
    assert.equal(result, "Olá");
  } finally {
    global.fetch = original;
  }
  assert.equal(calls, 2, "429 genérico deveria continuar tentando de novo (retry normal)");
});

test("translateBatchWithRetry: NÃO faz retry quando o erro vem com retryable:false", async () => {
  let calls = 0;
  const original = global.fetch;
  global.fetch = async () => {
    calls += 1;
    return { ok: false, status: 403, json: async () => ({ error: { message: "API key not valid" } }) };
  };
  try {
    const settings = { llmProvider: "google", llmApiKey: "chave-errada", llmModel: "gemini-2.5-flash" };
    await assert.rejects(() => core.translateBatchWithRetry(["a", "b"], settings, [], {}));
  } finally {
    global.fetch = original;
  }
  assert.equal(calls, 1, "chave inválida do Google (403) não deveria disparar retry no lote");
});

// ---------------------------------------------------------------------------
// Auditoria 1.3: criptografia opcional da chave de API em repouso (AES-GCM
// via Web Crypto, derivado da frase-senha com PBKDF2). Não protege a chave
// em trânsito (isso é inerente a chamar a API direto do navegador) — só
// protege o dado salvo no IndexedDB.
// ---------------------------------------------------------------------------

test("encryptApiKey + decryptApiKey: ida-e-volta perfeita com a frase-senha certa", async () => {
  const plain = "sk-ant-super-secreta-123";
  const encrypted = await core.encryptApiKey(plain, "minha frase secreta");
  assert.ok(encrypted.cipher && encrypted.iv && encrypted.salt);
  assert.notEqual(encrypted.cipher, plain); // não pode estar em texto puro
  const decrypted = await core.decryptApiKey(encrypted, "minha frase secreta");
  assert.equal(decrypted, plain);
});

test("decryptApiKey: frase-senha errada falha (não devolve lixo silenciosamente)", async () => {
  const encrypted = await core.encryptApiKey("chave-real", "senha-certa");
  await assert.rejects(() => core.decryptApiKey(encrypted, "senha-errada"));
});

test("encryptApiKey: mesma chave + mesma frase-senha produz cifras DIFERENTES a cada vez (salt/iv aleatórios)", async () => {
  const a = await core.encryptApiKey("mesma-chave", "mesma-senha");
  const b = await core.encryptApiKey("mesma-chave", "mesma-senha");
  assert.notEqual(a.cipher, b.cipher, "salt/iv aleatórios devem produzir cifras diferentes, mesmo com o mesmo texto e senha");
  // mas as duas decifram pro mesmo valor original
  assert.equal(await core.decryptApiKey(a, "mesma-senha"), "mesma-chave");
  assert.equal(await core.decryptApiKey(b, "mesma-senha"), "mesma-chave");
});

test("bytesToBase64/base64ToBytes: ida-e-volta preserva os bytes exatos", () => {
  const original = new Uint8Array([0, 1, 255, 128, 42, 7]);
  const b64 = core.bytesToBase64(original);
  const roundtrip = core.base64ToBytes(b64);
  assert.deepEqual(Array.from(roundtrip), Array.from(original));
});

// ---------------------------------------------------------------------------
// Auditoria 2.3: reforço pós-tradução do glossário só pro motor LLM — se o
// modelo deixou o termo em INGLÊS escapar (não seguiu a instrução do
// prompt), a tradução fixa cadastrada é aplicada por cima como rede de
// segurança adicional (os motores estatísticos já tinham garantia de 100%
// via protectProperNouns; o LLM só tinha "confiar na instrução").
// ---------------------------------------------------------------------------

test("enforceFixedGlossaryTerms: troca o termo em inglês que escapou pela tradução fixa cadastrada", () => {
  const properNouns = [{ term: "Thors Academy", translation: "Academia Thors" }];
  const result = core.enforceFixedGlossaryTerms("Bem-vindo à Thors Academy hoje", properNouns);
  assert.equal(result, "Bem-vindo à Academia Thors hoje");
});

test("enforceFixedGlossaryTerms: não mexe quando a tradução já foi aplicada corretamente", () => {
  const properNouns = [{ term: "Thors Academy", translation: "Academia Thors" }];
  const result = core.enforceFixedGlossaryTerms("Bem-vindo à Academia Thors hoje", properNouns);
  assert.equal(result, "Bem-vindo à Academia Thors hoje");
});

test("enforceFixedGlossaryTerms: não mexe em termo sem tradução fixa cadastrada (deixa como o modelo devolveu)", () => {
  const properNouns = [{ term: "Rean", translation: "" }];
  const result = core.enforceFixedGlossaryTerms("Rean sorriu.", properNouns);
  assert.equal(result, "Rean sorriu.");
});

test("enforceFixedGlossaryTerms: aplica vários termos do glossário na mesma frase", () => {
  const properNouns = [
    { term: "Thors Academy", translation: "Academia Thors" },
    { term: "Rean", translation: "Rean" },
  ];
  const result = core.enforceFixedGlossaryTerms("Rean estuda na Thors Academy.", properNouns);
  assert.equal(result, "Rean estuda na Academia Thors.");
});

test("translateViaLLM aplica enforceFixedGlossaryTerms depois de restaurar os códigos", async () => {
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    // "modelo" que devolve o termo em inglês por engano, mesmo instruído a traduzir
    return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "Bem-vindo à Thors Academy!" }] }) };
  };
  try {
    const settings = { engine: "llm", llmProvider: "anthropic", llmApiKey: "sk-ant-fake", llmModel: "claude-sonnet-5" };
    const properNouns = [{ term: "Thors Academy", translation: "Academia Thors" }];
    const result = await core.translateViaLLM("Welcome to Thors Academy!", settings, properNouns, {});
    assert.equal(result, "Bem-vindo à Academia Thors!");
  } finally {
    global.fetch = original;
  }
});

// ---------------------------------------------------------------------------
// Auditoria 3.2: compileGlossary cacheia os regex do glossário por
// REFERÊNCIA do array properNouns — chamadas repetidas com o MESMO array
// não recompilam nada, só quando o array muda de referência (glossário
// editado de verdade).
// ---------------------------------------------------------------------------

test("findGlossaryMismatches continua funcionando igual (comportamento público inalterado)", () => {
  const properNouns = [{ term: "Thors Academy", translation: "Academia Thors" }];
  const mismatches = core.findGlossaryMismatches("Welcome to Thors Academy", "Bem-vindo à academia", properNouns);
  assert.ok(mismatches.length > 0);
  assert.equal(mismatches[0].term, "Thors Academy");
});

test("compileGlossary: mesma referência de array devolve o MESMO array compilado (cache hit)", () => {
  const properNouns = [{ term: "Rean", translation: "Rean" }];
  const a = core.compileGlossary(properNouns);
  const b = core.compileGlossary(properNouns);
  assert.equal(a, b, "deveria ser o EXATO mesmo array (cache), não só igual por valor");
});

test("compileGlossary: arrays DIFERENTES (mesmo com conteúdo igual) não compartilham cache", () => {
  const a = core.compileGlossary([{ term: "Rean", translation: "Rean" }]);
  const b = core.compileGlossary([{ term: "Rean", translation: "Rean" }]);
  assert.notEqual(a, b, "arrays diferentes (glossário recriado) não devem reaproveitar o cache um do outro");
  assert.deepEqual(a.map((x) => x.term), b.map((x) => x.term));
});

test("compileGlossary: ignora termos sem tradução fixa cadastrada", () => {
  const compiled = core.compileGlossary([{ term: "Rean", translation: "" }, { term: "Fie", translation: "Fie" }]);
  assert.equal(compiled.length, 1);
  assert.equal(compiled[0].term, "Fie");
});

test("compileGlossary: array vazio/indefinido não quebra", () => {
  assert.deepEqual(core.compileGlossary([]), []);
  assert.deepEqual(core.compileGlossary(null), []);
  assert.deepEqual(core.compileGlossary(undefined), []);
});

// ---------------------------------------------------------------------------
// Auditoria 1.4: instrução explícita sobre item vazio no prompt de lote —
// evita que o modelo "pule" um índice vazio e desalinhe o array de resposta.
// ---------------------------------------------------------------------------
test("buildLlmBatchSystemPrompt instrui a não pular item vazio/só com espaços", () => {
  const prompt = core.buildLlmBatchSystemPrompt([], []);
  assert.match(prompt, /vazio ou só com espaços/);
  assert.match(prompt, /nunca remova nem pule um índice/);
});

// ---------------------------------------------------------------------------
// Auditoria 2.4: pipeline completo do motor estatístico (código + nome
// próprio + pontuação protegidos juntos) com a NOVA ordem (código primeiro).
// Confirma que as 3 proteções continuam coexistindo sem se atropelar depois
// da reordenação, e que o restore (ordem inversa) devolve tudo certinho.
// ---------------------------------------------------------------------------

test("translateText (motor estatístico): código + nome próprio + pontuação protegidos juntos sobrevivem ao pipeline inteiro", async () => {
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    // "tradutor" fake: LibreTranslate devolve o texto praticamente intacto
    // (só simula trocar uma palavra), mantendo todos os marcadores de
    // proteção como vieram
    const body = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ translatedText: body.q.replace("Wait", "Espere") }) };
  };
  try {
    const settings = { engine: "libretranslate", ltEndpoint: "http://localhost:5000/translate" };
    const properNouns = [{ term: "Rean", translation: "Rean" }];
    const result = await core.translateText("Wait...#B_0Rean's here!", settings, properNouns);
    // código do jogo tem que sobreviver colado, nome próprio tem que
    // sobreviver colado ao apóstrofo, pontuação tem que sobreviver
    assert.match(result, /#B_0Rean's/, "código e nome próprio devem voltar colados um no outro, sem espaço extra");
    assert.match(result, /Espere\.\.\./, "reticências protegidas devem sobreviver");
  } finally {
    global.fetch = original;
  }
});

test("matchAllCodes: auditoria 5.2 — regex local por chamada, sem estado global mutável", () => {
  // matches simples, sem chamada anterior deixando lastIndex sujo
  const m1 = core.matchAllCodes("Olá #E[12] mundo #M_4 fim");
  assert.deepEqual(m1.map((m) => m.text), ["#E[12]", "#M_4"]);
  assert.equal(m1[0].start, 4);
  assert.equal(m1[0].end, 10);

  // chamar duas vezes seguidas com textos diferentes não pode vazar
  // lastIndex de uma chamada pra outra (a própria razão de ser da 5.2)
  const m2 = core.matchAllCodes("#C só um código simples");
  assert.deepEqual(m2.map((m) => m.text), ["#C"]);
  const m3 = core.matchAllCodes("#C só um código simples");
  assert.deepEqual(m3.map((m) => m.text), ["#C"], "segunda chamada com o mesmo texto deve achar o mesmo resultado, sem efeito de estado deixado pela chamada anterior");

  // string sem nenhum código
  assert.deepEqual(core.matchAllCodes("texto normal sem código nenhum"), []);

  // extractCodes/protectCodes continuam consistentes por cima do novo helper
  assert.deepEqual(core.extractCodes("#E[12] e #M_4"), ["#E[12]", "#M_4"]);
  const { protectedText, tokens } = core.protectCodes("#E[12]#M_4 texto");
  assert.equal(tokens.length, 1, "códigos consecutivos colados continuam se fundindo num único token");
  assert.match(protectedText, /§0§/);
});

test("withExportProgress: auditoria 5.3 — mesma contagem/ordem em qualquer branch, com e sem delay", async () => {
  const seen = [];
  const progressCalls = [];
  await core.withExportProgress(
    ["a", "b", "c"],
    async (target) => { seen.push(target); },
    (done, total) => progressCalls.push({ done, total }),
  );
  assert.deepEqual(seen, ["a", "b", "c"], "itera todos os targets, na ordem, uma vez cada");
  assert.deepEqual(progressCalls, [
    { done: 1, total: 3 },
    { done: 2, total: 3 },
    { done: 3, total: 3 },
  ], "reporta progresso incremental após cada item, terminando em done === total");

  // lista vazia não deve chamar onProgress nenhuma vez
  const calls2 = [];
  await core.withExportProgress([], async () => {}, () => calls2.push(1));
  assert.deepEqual(calls2, []);

  // com delayMs, ainda preserva ordem e contagem (só adiciona uma pausa
  // entre iterações — não estamos testando o tempo real, só o comportamento)
  const seen3 = [];
  await core.withExportProgress(["x", "y"], async (t) => seen3.push(t), () => {}, 1);
  assert.deepEqual(seen3, ["x", "y"]);
});

// ---------------------------------------------------------------------------
// Motor OpenAI — afinação por modelo/endpoint
// ---------------------------------------------------------------------------

test("isOpenAiReasoningModel: separa família de raciocínio dos modelos clássicos", () => {
  // clássicos (contrato antigo: max_tokens + temperature)
  assert.equal(core.isOpenAiReasoningModel("gpt-4o-mini"), false);
  assert.equal(core.isOpenAiReasoningModel("gpt-4o"), false, "gpt-4o NÃO pode ser confundido com gpt-5 pelo regex");
  assert.equal(core.isOpenAiReasoningModel("gpt-4.1"), false);
  assert.equal(core.isOpenAiReasoningModel(""), false);
  assert.equal(core.isOpenAiReasoningModel(null), false);
  // raciocínio (contrato novo: max_completion_tokens, sem temperature)
  assert.equal(core.isOpenAiReasoningModel("gpt-5"), true);
  assert.equal(core.isOpenAiReasoningModel("gpt-5.1"), true);
  assert.equal(core.isOpenAiReasoningModel("gpt-5-mini"), true);
  assert.equal(core.isOpenAiReasoningModel("GPT-5-Nano"), true, "detecção não pode depender de caixa");
  assert.equal(core.isOpenAiReasoningModel("o3-mini"), true);
  assert.equal(core.isOpenAiReasoningModel("o1"), true);
  assert.equal(core.isOpenAiReasoningModel("o4-mini"), true);
});

test("openAiReasoningEffortFor: menor esforço que CADA família aceita", () => {
  assert.equal(core.openAiReasoningEffortFor("gpt-5.1"), "none");
  assert.equal(core.openAiReasoningEffortFor("gpt-5.2-mini"), "none");
  // gpt-5 "puro" não aceita none — minimal é o piso seguro
  assert.equal(core.openAiReasoningEffortFor("gpt-5"), "minimal");
  assert.equal(core.openAiReasoningEffortFor("gpt-5-mini"), "minimal");
  // série "o" não aceita minimal — low é o piso seguro
  assert.equal(core.openAiReasoningEffortFor("o3-mini"), "low");
  assert.equal(core.openAiReasoningEffortFor("o1"), "low");
  // modelo clássico não tem esse conceito
  assert.equal(core.openAiReasoningEffortFor("gpt-4o-mini"), null);
});

test("buildOpenAiTuning: modelo CLÁSSICO usa max_tokens + temperature 0 + seed", () => {
  const t = core.buildOpenAiTuning({ llmModel: "gpt-4o-mini" }, "SYS", 1024);
  assert.equal(t.max_tokens, 1024);
  assert.equal(t.max_completion_tokens, undefined, "modelo clássico não pode receber o campo novo");
  assert.equal(t.temperature, 0, "temperature 0 reduz invenção nos modelos clássicos");
  assert.equal(t.seed, 7);
  assert.equal(t.reasoning_effort, undefined, "modelo clássico não aceita reasoning_effort");
});

test("buildOpenAiTuning: modelo de RACIOCÍNIO troca o campo de tokens e some com temperature", () => {
  const t = core.buildOpenAiTuning({ llmModel: "gpt-5-mini" }, "SYS", 2048);
  // este é o bug que impedia usar gpt-5-mini: max_tokens dá HTTP 400 nesses modelos
  assert.equal(t.max_completion_tokens, 2048);
  assert.equal(t.max_tokens, undefined, "max_tokens é REJEITADO pelos modelos de raciocínio");
  assert.equal(t.temperature, undefined, "temperature != padrão também é rejeitada");
  assert.equal(t.seed, undefined);
  assert.equal(t.reasoning_effort, "minimal", "esforço no mínimo: traduzir diálogo não precisa de raciocínio");
});

test("buildOpenAiTuning: override manual de reasoning_effort ganha do automático", () => {
  const auto = core.buildOpenAiTuning({ llmModel: "gpt-5-mini", openaiReasoningEffort: "auto" }, "SYS", 512);
  assert.equal(auto.reasoning_effort, "minimal");
  const manual = core.buildOpenAiTuning({ llmModel: "gpt-5-mini", openaiReasoningEffort: "medium" }, "SYS", 512);
  assert.equal(manual.reasoning_effort, "medium");
});

test("buildOpenAiTuning: service_tier só sai quando escolhido explicitamente", () => {
  const padrao = core.buildOpenAiTuning({ llmModel: "gpt-4o-mini", openaiServiceTier: "auto" }, "SYS", 512);
  assert.equal(padrao.service_tier, undefined, "'auto' não manda o campo — não muda a fatura de ninguém sem pedir");
  assert.equal(core.buildOpenAiTuning({ llmModel: "gpt-4o-mini", openaiServiceTier: "priority" }, "SYS", 512).service_tier, "priority");
  assert.equal(core.buildOpenAiTuning({ llmModel: "gpt-4o-mini", openaiServiceTier: "flex" }, "SYS", 512).service_tier, "flex");
  // valor inválido não pode vazar pro corpo da requisição
  assert.equal(core.buildOpenAiTuning({ llmModel: "gpt-4o-mini", openaiServiceTier: "turbo" }, "SYS", 512).service_tier, undefined);
});

test("buildOpenAiTuning: endpoint LOCAL só recebe campos que o dialeto antigo entende", () => {
  const t = core.buildOpenAiTuning(
    { llmProvider: "openai", llmModel: "llama3", openaiBaseUrl: "http://localhost:11434/v1/chat/completions", openaiNumCtx: 4096, openaiServiceTier: "priority" },
    "SYS",
    1024
  );
  assert.equal(t.max_tokens, 1024);
  assert.equal(t.temperature, 0);
  assert.equal(t.seed, 7, "o shim de compatibilidade respeita seed");
  // num_ctx e keep_alive NÃO vão mais por aqui: nenhum endpoint
  // compatível-OpenAI os aplica (o shim descarta campo fora do padrão).
  // Quem precisa deles usa a API nativa, onde funcionam de verdade.
  assert.equal(t.num_ctx, undefined);
  assert.equal(t.keep_alive, undefined);
  // nada específico da API oficial pode ir pro servidor local: campo
  // desconhecido faz alguns servidores rejeitarem a requisição inteira
  assert.equal(t.service_tier, undefined);
  assert.equal(t.prompt_cache_key, undefined);
  assert.equal(t.reasoning_effort, undefined);
  assert.equal(t.max_completion_tokens, undefined);
});

test("buildOpenAiTuning: mesmo modelo LOCAL com nome de raciocínio não muda o contrato", () => {
  // alguém rodando um "gpt-5-ish" local não pode ganhar max_completion_tokens
  const t = core.buildOpenAiTuning(
    { llmProvider: "openai", llmModel: "gpt-5-mini", openaiBaseUrl: "http://localhost:1234/v1/chat/completions" },
    "SYS",
    900
  );
  assert.equal(t.max_tokens, 900);
  assert.equal(t.max_completion_tokens, undefined);
});

test("prompt_cache_key: estável pro mesmo prompt, diferente pra prompt diferente", () => {
  const a = core.hashStringToKey("prompt de sistema A");
  const b = core.hashStringToKey("prompt de sistema A");
  const c2 = core.hashStringToKey("prompt de sistema B");
  assert.equal(a, b, "mesmo prompt tem que gerar a mesma chave — é o que faz o cache acertar");
  assert.notEqual(a, c2);

  // a chave carrega o hash do prompt: dois prompts diferentes nunca podem
  // cair na mesma chave (senão o roteamento manda pro backend errado)
  const k1 = core.openAiPromptCacheKey("SYS-1", 0);
  const k2 = core.openAiPromptCacheKey("SYS-2", 0);
  assert.notEqual(k1, k2);
  assert.equal(core.openAiPromptCacheKey("SYS-1", 0), k1, "determinística");

  // as fatias rodam em rodízio pra nenhuma passar do teto recomendado de
  // requisições por minuto, mas todas continuam vendo o MESMO prefixo
  const keys = new Set();
  for (let i = 0; i < core.OPENAI_CACHE_SHARDS * 3; i++) {
    keys.add(core.buildOpenAiTuning({ llmModel: "gpt-4o-mini" }, "MESMO SYS", 512).prompt_cache_key);
  }
  assert.equal(keys.size, core.OPENAI_CACHE_SHARDS, `deve circular por exatamente ${core.OPENAI_CACHE_SHARDS} fatias`);
  for (const k of keys) assert.match(k, /^tlohcs3-[0-9a-z]+-\d$/);
});

test("llmPacingFor / llmBatchSizeFor: calibragem por provedor E por endpoint", () => {
  // API oficial da OpenAI: dá pra paralelizar bem mais que os 2 de antes
  const openai = core.llmPacingFor({ llmProvider: "openai" });
  assert.equal(openai.concurrency, 4);
  assert.equal(core.llmBatchSizeFor({ engine: "llm", llmProvider: "openai" }), 30);

  // servidor local: paralelizar não acelera (mesma GPU) e ainda atrapalha
  const local = { llmProvider: "openai", openaiBaseUrl: "http://localhost:11434/v1/chat/completions" };
  assert.equal(core.llmPacingFor(local).concurrency, 1, "local tem que ser serial");
  assert.equal(core.llmPacingFor(local).paceMs, 0, "sem cota externa, não precisa de pausa artificial");
  assert.equal(core.llmBatchSizeFor({ engine: "llm", ...local }), 10, "lote menor: modelo local erra mais o formato em lote grande");

  // Google continua conservador por causa da cota do tier gratuito
  assert.equal(core.llmPacingFor({ llmProvider: "google" }).concurrency, 1);
  assert.equal(core.llmPacingFor("google").concurrency, 1, "aceita string por compatibilidade com o call site antigo");
  // Anthropic mantém o comportamento anterior
  assert.equal(core.llmPacingFor({ llmProvider: "anthropic" }).concurrency, 2);

  // motor estatístico não usa lote de LLM
  assert.equal(core.llmBatchSizeFor({ engine: "mymemory", llmProvider: "openai" }), 20);
});

test("fewShotCountFor: modelos pequenos (Haiku e mini/nano da OpenAI) ganham mais exemplos", () => {
  assert.equal(core.fewShotCountFor({ llmProvider: "anthropic", llmModel: "claude-haiku-4-5" }), 5);
  assert.equal(core.fewShotCountFor({ llmProvider: "anthropic", llmModel: "claude-sonnet-5" }), 3);
  assert.equal(core.fewShotCountFor({ llmProvider: "openai", llmModel: "gpt-4o-mini" }), 5);
  assert.equal(core.fewShotCountFor({ llmProvider: "openai", llmModel: "gpt-5-nano" }), 5);
  assert.equal(core.fewShotCountFor({ llmProvider: "openai", llmModel: "gpt-4o" }), 3);
  assert.equal(core.fewShotCountFor(null), 3);
});

test("OpenAI: afinação NOVA não afeta em nada as regras de proteção do texto", async () => {
  // Este é o teste que importa de verdade: as mudanças de velocidade
  // (reasoning_effort, service_tier, prompt_cache_key, lote maior,
  // concorrência maior) mexem SÓ no transporte. O contrato de proteção —
  // §N§ pra código do jogo, glossário forçado, contagem de linhas — tem
  // que continuar idêntico ponta a ponta.
  const original = global.fetch;
  const bodies = [];
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    bodies.push(body);
    // "modelo" fake: devolve os itens recebidos com uma palavra trocada,
    // preservando os marcadores exatamente como chegaram
    const items = JSON.parse(body.messages[1].content).items;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ translations: items.map((t) => t.replace("Wait", "Espere").replace("here", "aqui")) }) } }],
      }),
    };
  };
  try {
    const settings = {
      engine: "llm",
      llmProvider: "openai",
      llmApiKey: "sk-teste",
      llmModel: "gpt-5-mini", // modelo de raciocínio: caminho novo do contrato
      openaiServiceTier: "priority",
    };
    const properNouns = [{ term: "Rean", translation: "Rean" }, { term: "Thors", translation: "Academia Thors" }];
    const out = await core.translateBatchViaLLM(
      ["Wait...#B_0Rean's here!", "#E[12]Thors is here"],
      settings,
      properNouns,
      {}
    );

    // 1) código do jogo sobrevive, colado, exatamente como no original
    assert.match(out[0], /#B_0/, "código #B_0 tem que voltar");
    assert.match(out[1], /#E\[12\]/, "código #E[12] tem que voltar");
    // 2) nenhum marcador de proteção pode vazar pro resultado final
    for (const t of out) {
      assert.ok(!/§\d+§/.test(t), `marcador de código vazou: ${t}`);
      assert.ok(!/¤\d+¤/.test(t), `marcador de nome próprio vazou: ${t}`);
      assert.ok(!/‡\d+‡/.test(t), `marcador de pontuação vazou: ${t}`);
    }
    // 3) glossário com tradução fixa continua sendo reforçado pós-tradução
    assert.match(out[1], /Academia Thors/, "termo fixo do glossário tem que ser aplicado");

    // 4) e o corpo enviado usa o contrato NOVO (o que destrava o gpt-5-mini)
    const body = bodies[0];
    assert.ok(body.max_completion_tokens > 0, "modelo de raciocínio precisa de max_completion_tokens");
    assert.equal(body.max_tokens, undefined, "max_tokens daria HTTP 400 aqui");
    assert.equal(body.temperature, undefined, "temperature também daria 400 aqui");
    assert.equal(body.reasoning_effort, "minimal");
    assert.equal(body.service_tier, "priority");
    assert.match(body.prompt_cache_key, /^tlohcs3-/);
    // schema estrito de saída continua no lugar (não foi perdido na refatoração)
    assert.equal(body.response_format.type, "json_schema");
    assert.equal(body.response_format.json_schema.strict, true);
  } finally {
    global.fetch = original;
  }
});

test("OpenAI: modelo clássico continua mandando o contrato antigo, com proteção intacta", async () => {
  const original = global.fetch;
  const bodies = [];
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    bodies.push(body);
    const items = JSON.parse(body.messages[1].content).items;
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ translations: items }) } }] }),
    };
  };
  try {
    const settings = { engine: "llm", llmProvider: "openai", llmApiKey: "sk-teste", llmModel: "gpt-4o-mini" };
    const out = await core.translateBatchViaLLM(["#E[1]Hello there"], settings, [], {});
    assert.match(out[0], /#E\[1\]/);
    assert.ok(!/§\d+§/.test(out[0]));

    const body = bodies[0];
    assert.ok(body.max_tokens > 0, "modelo clássico usa max_tokens");
    assert.equal(body.max_completion_tokens, undefined);
    assert.equal(body.temperature, 0);
    assert.equal(body.seed, 7);
    assert.equal(body.reasoning_effort, undefined);
  } finally {
    global.fetch = original;
  }
});

// ---------------------------------------------------------------------------
// Reparo de código do jogo ausente (item crítico do QA)
// ---------------------------------------------------------------------------

test("splitLeadingTrailingCodes: separa as pontas de código do miolo", () => {
  const a = core.splitLeadingTrailingCodes("#E[12]#M_4Wait here#K");
  assert.equal(a.lead, "#E[12]#M_4");
  assert.equal(a.core, "Wait here");
  assert.equal(a.trail, "#K");

  const semCodigo = core.splitLeadingTrailingCodes("só texto");
  assert.equal(semCodigo.lead, "");
  assert.equal(semCodigo.core, "só texto");
  assert.equal(semCodigo.trail, "");

  // fala que é SÓ código não pode contar o mesmo código como lead e trail
  const soCodigo = core.splitLeadingTrailingCodes("#E[1]#K");
  assert.equal(soCodigo.lead, "#E[1]#K");
  assert.equal(soCodigo.core, "");
  assert.equal(soCodigo.trail, "", "nada pode ser contado duas vezes");
});

test("repairMissingCodes: devolve códigos das PONTAS, preservando a tradução", () => {
  const r = core.repairMissingCodes("#E[12]#M_4Wait... Rean is here!#K", "Espere... Rean está aqui!");
  assert.equal(r.fixed, true);
  assert.equal(r.changed, true);
  assert.equal(r.text, "#E[12]#M_4Espere... Rean está aqui!#K");
  // sequência de códigos idêntica à do original — mesma ordem, mesma contagem
  assert.deepEqual(core.extractCodes(r.text), core.extractCodes("#E[12]#M_4Wait... Rean is here!#K"));
});

test("repairMissingCodes: RECUSA quando o código fica no meio da fala", () => {
  // aqui não dá pra saber em que ponto do texto traduzido o #M_2 entraria —
  // chutar a posição pode trocar a expressão do personagem na hora errada
  const r = core.repairMissingCodes("#E[1]Hello#M_2World", "Olá Mundo");
  assert.equal(r.fixed, false, "não pode fingir que consertou");
  assert.equal(r.changed, false);
  assert.equal(r.text, "Olá Mundo", "a tradução não pode ser tocada quando o reparo não é seguro");
  assert.ok(r.unfixable.length > 0);
  assert.equal(core.canRepairMissingCodes("#E[1]Hello#M_2World", "Olá Mundo"), false);
});

test("repairMissingCodes: não duplica código que já está na tradução", () => {
  const r = core.repairMissingCodes("#E[1]Hello there", "#E[1]Olá");
  assert.equal(r.fixed, true);
  assert.equal(r.changed, false, "nada a fazer — já estava correto");
  assert.equal(core.countOccurrences(r.text, "#E[1]"), 1, "não pode virar #E[1]#E[1]");
  assert.equal(core.canRepairMissingCodes("#E[1]Hello there", "#E[1]Olá"), false, "sem mudança, não oferece o botão");
});

test("repairMissingCodes: conserta ponta parcial (só o começo ou só o fim)", () => {
  const soInicio = core.repairMissingCodes("#E[1]Hello there", "Olá");
  assert.equal(soInicio.text, "#E[1]Olá");
  assert.equal(soInicio.fixed, true);

  const soFim = core.repairMissingCodes("Hello there#K", "Olá");
  assert.equal(soFim.text, "Olá#K");
  assert.equal(soFim.fixed, true);
});

test("repairMissingCodes: código fora de ordem NÃO é escopo deste reparo", () => {
  // Limite conhecido e proposital: o crítico do QA é "código ausente ou em
  // quantidade menor". Aqui os dois códigos estão presentes, na quantidade
  // certa — só a ORDEM está trocada. Como o QA não marca isso como crítico,
  // o botão de reinserir nem aparece, e o reparo devolve a tradução intacta
  // em vez de reescrever uma linha que ninguém pediu pra mexer.
  const r = core.repairMissingCodes("#E[1]Hello there#K", "#K Olá #E[1]");
  assert.equal(r.fixed, true);
  assert.equal(r.changed, false, "não mexe numa linha que não está com código FALTANDO");
  assert.equal(r.text, "#K Olá #E[1]");
  assert.equal(core.canRepairMissingCodes("#E[1]Hello there#K", "#K Olá #E[1]"), false);
});

test("repairMissingCodes: original sem código nenhum é no-op", () => {
  const r = core.repairMissingCodes("no codes here", "sem código aqui");
  assert.equal(r.fixed, true);
  assert.equal(r.changed, false);
  assert.equal(r.text, "sem código aqui");
});

test("repairMissingCodes: reparo resolve de fato o crítico do QA", () => {
  // fecha o ciclo: entra crítico -> repara -> sai limpo
  const entry = { ref: "A1", original: "#E[12]Wait...#K", codes: core.extractCodes("#E[12]Wait...#K"), lineCount: 1, lang: "en" };
  const ruim = "Espere...";
  const antes = core.checkEntryIssues(entry, ruim, []);
  assert.ok(antes.some((i) => i.severity === "critical" && i.type === "missing-code"), "cenário de partida tem que ser crítico");

  const r = core.repairMissingCodes(entry.original, ruim);
  assert.equal(r.fixed, true);
  const depois = core.checkEntryIssues(entry, r.text, []);
  assert.equal(depois.filter((i) => i.severity === "critical").length, 0, "depois do reparo não pode sobrar crítico");
});

test("repairMissingCodes: código duplicado no original volta nas duas pontas", () => {
  // #K aparece 2x: uma no começo, uma no fim
  const r = core.repairMissingCodes("#KWait#K", "Espere");
  assert.equal(r.fixed, true);
  assert.equal(core.countOccurrences(r.text, "#K"), 2, "as DUAS ocorrências têm que voltar");
});

// ---------------------------------------------------------------------------
// Auditoria #2
// ---------------------------------------------------------------------------

test("M2: cache do glossário de reforço não quebra com regex reaproveitada", () => {
  const properNouns = [
    { term: "Thors", translation: "Academia Thors" },
    { term: "Rean", translation: "Rean" },
  ];
  // Mesma referência de array duas vezes -> mesma lista compilada (WeakMap)
  const a = core.compileEnforceableGlossary(properNouns);
  const b = core.compileEnforceableGlossary(properNouns);
  assert.strictEqual(a, b, "deve reaproveitar a compilação enquanto o glossário for o mesmo objeto");
  assert.equal(a.length, 2);
  // a regex de TESTE não pode ter flag global — senão .test() guarda
  // lastIndex entre chamadas e passa a falhar de forma intermitente
  for (const pn of a) {
    assert.equal(pn.test.global, false, "regex de teste não pode ser global (lastIndex viraria estado)");
    assert.equal(pn.all.global, true, "a de replace precisa ser global");
  }

  // chamar várias vezes seguidas tem que dar SEMPRE o mesmo resultado —
  // é exatamente isso que uma regex /g reaproveitada quebraria
  for (let i = 0; i < 5; i++) {
    assert.equal(
      core.enforceFixedGlossaryTerms("Thors is here", properNouns),
      "Academia Thors is here",
      `chamada ${i + 1} tem que dar o mesmo resultado da primeira`
    );
  }

  // glossário novo (outra referência) recompila
  const outro = core.compileEnforceableGlossary([{ term: "Ash", translation: "Ash" }]);
  assert.notStrictEqual(outro, a);
});

test("M2: reforço de glossário mantém o comportamento de antes", () => {
  const pns = [{ term: "Thors", translation: "Academia Thors" }];
  // termo em inglês sobrou -> troca
  assert.equal(core.enforceFixedGlossaryTerms("Thors fica ali", pns), "Academia Thors fica ali");
  // tradução esperada já presente -> não mexe (evita troca dupla)
  assert.equal(core.enforceFixedGlossaryTerms("Academia Thors fica ali", pns), "Academia Thors fica ali");
  // termo ausente -> não mexe
  assert.equal(core.enforceFixedGlossaryTerms("nada aqui", pns), "nada aqui");
  // glossário vazio/nulo -> devolve igual
  assert.equal(core.enforceFixedGlossaryTerms("texto", []), "texto");
  assert.equal(core.enforceFixedGlossaryTerms("texto", null), "texto");
});

test("M3: freio de rate limit é compartilhado e acumula o maior tempo", () => {
  const gate = core.createRateLimitGate();
  assert.equal(gate.until, 0, "começa aberto");

  const antes = Date.now();
  core.noteRateLimited(gate, 3000);
  assert.ok(gate.until >= antes + 3000 - 50, "fecha o portão pelo tempo pedido");

  // um segundo 429 mais curto NÃO pode encurtar a espera já combinada
  const marcaLonga = gate.until;
  core.noteRateLimited(gate, 500);
  assert.equal(gate.until, marcaLonga, "espera mais longa prevalece");

  // um mais longo estende
  core.noteRateLimited(gate, 10000);
  assert.ok(gate.until > marcaLonga);

  // teto de segurança: nunca trava o lote por mais de ~65s
  const g2 = core.createRateLimitGate();
  core.noteRateLimited(g2, 999999);
  assert.ok(g2.until - Date.now() <= 65000 + 50, "tem que respeitar o teto");

  // sem retryAfter, usa um padrão razoável
  const g3 = core.createRateLimitGate();
  core.noteRateLimited(g3, undefined);
  assert.ok(g3.until > Date.now(), "sem Retry-After ainda assim fecha o portão");
});

test("M3: portão aberto não atrasa nada", async () => {
  const gate = core.createRateLimitGate();
  const t0 = Date.now();
  await core.waitForRateLimitGate(gate);
  assert.ok(Date.now() - t0 < 50, "portão aberto tem que passar direto");
  await core.waitForRateLimitGate(null); // não pode explodir
});

test("B5: shardHint fixa a fatia do cache entre as tentativas", () => {
  const sys = "PROMPT DE SISTEMA";
  // mesmo hint -> mesma chave, sempre (é o que faz a retentativa reaproveitar
  // o prefixo já quente)
  const k1 = core.buildOpenAiTuning({ llmModel: "gpt-4o-mini" }, sys, 512, 2).prompt_cache_key;
  const k2 = core.buildOpenAiTuning({ llmModel: "gpt-4o-mini" }, sys, 512, 2).prompt_cache_key;
  const k3 = core.buildOpenAiTuning({ llmModel: "gpt-4o-mini" }, sys, 512, 2).prompt_cache_key;
  assert.equal(k1, k2);
  assert.equal(k2, k3);

  // hints diferentes -> fatias diferentes (distribui a carga por chave)
  const outro = core.buildOpenAiTuning({ llmModel: "gpt-4o-mini" }, sys, 512, 3).prompt_cache_key;
  assert.notEqual(k1, outro);

  // hint acima do número de fatias dá a volta, não estoura
  const volta = core.buildOpenAiTuning({ llmModel: "gpt-4o-mini" }, sys, 512, 2 + core.OPENAI_CACHE_SHARDS).prompt_cache_key;
  assert.equal(volta, k1);

  // sem hint, mantém o rodízio de antes
  const semHint = new Set();
  for (let i = 0; i < core.OPENAI_CACHE_SHARDS * 2; i++) {
    semHint.add(core.buildOpenAiTuning({ llmModel: "gpt-4o-mini" }, sys, 512).prompt_cache_key);
  }
  assert.equal(semHint.size, core.OPENAI_CACHE_SHARDS);
});

// ---------------------------------------------------------------------------
// Servidor local (Ollama) — prompt enxuto e calibragem ajustável
// ---------------------------------------------------------------------------

test("filterGlossaryForTexts: mantém só os termos presentes no lote", () => {
  const pns = [
    { term: "Rean", translation: "Rean" },
    { term: "Thors", translation: "Academia Thors" },
    { term: "Ash", translation: "Ash" },
  ];
  const lote = ["Rean, are you coming?", "The Thors campus is quiet."];
  const filtrado = core.filterGlossaryForTexts(pns, lote);
  assert.deepEqual(filtrado.map((p) => p.term), ["Rean", "Thors"]);
  assert.ok(!filtrado.some((p) => p.term === "Ash"), "termo ausente do lote não pode ir no prompt");

  // sem correspondência -> lista vazia (prompt sem seção de glossário)
  assert.deepEqual(core.filterGlossaryForTexts(pns, ["Nothing here."]), []);
  // entradas degeneradas não podem explodir
  assert.deepEqual(core.filterGlossaryForTexts([], ["x"]), []);
  assert.deepEqual(core.filterGlossaryForTexts(null, ["x"]), []);
  assert.deepEqual(core.filterGlossaryForTexts(pns, []), []);
  // aceita string única além de array
  assert.deepEqual(core.filterGlossaryForTexts(pns, "Rean fala").map((p) => p.term), ["Rean"]);
});

test("filterGlossaryForTexts: casa sem depender de caixa", () => {
  const pns = [{ term: "Thors", translation: "Academia Thors" }];
  assert.equal(core.filterGlossaryForTexts(pns, ["welcome to THORS"]).length, 1);
  assert.equal(core.filterGlossaryForTexts(pns, ["welcome to thors"]).length, 1);
});

test("filterGlossaryForTexts: corta o prompt de forma expressiva num glossário real", () => {
  // cenário representativo: glossário de RPG completo, lote de 10 falas
  const pns = [];
  for (let i = 0; i < 250; i++) pns.push({ term: "Termo" + i, translation: "Trad" + i });
  pns.push({ term: "Rean", translation: "Rean" });
  const lote = ["Rean, wait!", "Nothing here.", "Let us go.", "I see."];

  const cheio = core.buildLlmBatchSystemPrompt(pns, []);
  const enxuto = core.buildLlmBatchSystemPrompt(core.filterGlossaryForTexts(pns, lote), []);
  assert.ok(enxuto.length < cheio.length * 0.4, "o prompt enxuto tem que ser bem menor que o cheio");
  // e não pode perder o termo que IMPORTA
  assert.match(enxuto, /Rean/);
});

test("Ollama: reforço de glossário continua usando a lista COMPLETA", async () => {
  // o filtro é só do PROMPT; a garantia pós-tradução não pode encolher junto,
  // senão a economia de tokens viraria perda de fidelidade
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    const items = JSON.parse(body.messages[1].content).items;
    // o "modelo" devolve o termo em inglês sem traduzir.
    // formato NATIVO do Ollama (message.content) — o endpoint local agora
    // usa /api/chat, não mais o /v1 compatível
    return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify({ translations: items }) } }) };
  };
  try {
    const settings = {
      engine: "llm", llmProvider: "openai", llmApiKey: "ollama", llmModel: "qwen2.5",
      openaiBaseUrl: "http://localhost:11434/v1/chat/completions",
    };
    const pns = [
      { term: "Thors", translation: "Academia Thors" },
      { term: "Ash", translation: "Ash" },        // ausente do lote
    ];
    const out = await core.translateBatchViaLLM(["Thors is here"], settings, pns, {});
    assert.match(out[0], /Academia Thors/, "o reforço tem que agir mesmo com o prompt enxuto");
  } finally {
    global.fetch = original;
  }
});

test("Ollama: keep_alive vive no corpo NATIVO, que é onde ele funciona", () => {
  // O keep_alive saiu do buildOpenAiTuning: no endpoint compatível ele era
  // descartado em silêncio (comprovado por `ollama ps` mostrando 5min
  // mesmo tendo sido pedido 30m). O lugar certo é o corpo da API nativa.
  const nativo = core.buildOllamaNativeBody(
    { llmModel: "qwen2.5", openaiNumCtx: 8192 }, "SYS", "USER", 512, false
  );
  assert.equal(nativo.keep_alive, "30m", "padrão evita a recarga do modelo a cada pausa");

  const custom = core.buildOllamaNativeBody(
    { llmModel: "qwen2.5", openaiKeepAlive: "2h" }, "SYS", "USER", 512, false
  );
  assert.equal(custom.keep_alive, "2h");

  // e não aparece em NENHUM caminho compatível-OpenAI
  assert.equal(core.buildOpenAiTuning({ llmModel: "gpt-4o-mini" }, "SYS", 1024).keep_alive, undefined);
  assert.equal(
    core.buildOpenAiTuning({ llmProvider: "openai", llmModel: "qwen2.5", openaiBaseUrl: "http://x/v1" }, "SYS", 1024).keep_alive,
    undefined
  );
});

test("Ollama: concorrência e lote locais são ajustáveis, com limites sãos", () => {
  const base = { llmProvider: "openai", openaiBaseUrl: "http://localhost:11434/v1/chat/completions" };
  // padrão continua serial, como antes
  assert.equal(core.llmPacingFor(base).concurrency, 1);
  assert.equal(core.llmPacingFor({ ...base, openaiLocalConcurrency: 4 }).concurrency, 4);
  // teto e piso: valor absurdo não pode derrubar a máquina de ninguém
  assert.equal(core.llmPacingFor({ ...base, openaiLocalConcurrency: 999 }).concurrency, 8);
  assert.equal(core.llmPacingFor({ ...base, openaiLocalConcurrency: 0 }).concurrency, 1);
  assert.equal(core.llmPacingFor({ ...base, openaiLocalConcurrency: "abc" }).concurrency, 1);

  const b = { engine: "llm", ...base };
  assert.equal(core.llmBatchSizeFor(b), 10, "padrão igual ao de antes");
  assert.equal(core.llmBatchSizeFor({ ...b, openaiLocalBatchSize: 25 }), 25);
  assert.equal(core.llmBatchSizeFor({ ...b, openaiLocalBatchSize: 999 }), 50);
  assert.equal(core.llmBatchSizeFor({ ...b, openaiLocalBatchSize: 0 }), 10);
});

test("API oficial NÃO usa glossário enxuto (prefixo estável = cache)", async () => {
  const original = global.fetch;
  const bodies = [];
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    bodies.push(body);
    const items = JSON.parse(body.messages[1].content).items;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ translations: items }) } }] }) };
  };
  try {
    const settings = { engine: "llm", llmProvider: "openai", llmApiKey: "sk-x", llmModel: "gpt-4o-mini" };
    const pns = [{ term: "Ash", translation: "Ash" }]; // ausente do texto
    await core.translateBatchViaLLM(["Nothing here"], settings, pns, {});
    // o termo ausente CONTINUA no prompt: variar o glossário por lote
    // destruiria o cache de prefixo, que é o que barateia e acelera na nuvem
    assert.match(bodies[0].messages[0].content, /Ash/);
  } finally {
    global.fetch = original;
  }
});

// ---------------------------------------------------------------------------
// API nativa do Ollama — o /v1 descarta num_ctx e keep_alive
// ---------------------------------------------------------------------------

test("ollamaNativeUrl: converte o endpoint compatível no nativo", () => {
  assert.equal(core.ollamaNativeUrl("http://localhost:11434/v1/chat/completions"), "http://localhost:11434/api/chat");
  assert.equal(core.ollamaNativeUrl("http://localhost:11434/v1/chat/completions/"), "http://localhost:11434/api/chat");
  assert.equal(core.ollamaNativeUrl("http://localhost:11434/v1"), "http://localhost:11434/api/chat");
  assert.equal(core.ollamaNativeUrl("http://localhost:11434/api/chat"), "http://localhost:11434/api/chat", "já nativa = não mexe");
  assert.equal(core.ollamaNativeUrl(""), "");
  assert.equal(core.ollamaNativeUrl(null), "");
});

test("isOllamaNativeEnabled: só liga em endpoint local, e dá pra desligar", () => {
  const local = { llmProvider: "openai", openaiBaseUrl: "http://localhost:11434/v1/chat/completions" };
  assert.equal(core.isOllamaNativeEnabled(local), true, "padrão ligado — é o que faz num_ctx/keep_alive valerem");
  assert.equal(core.isOllamaNativeEnabled({ ...local, openaiUseOllamaNative: false }), false, "desligável p/ LM Studio/vLLM");
  // nuvem nunca usa
  assert.equal(core.isOllamaNativeEnabled({ llmProvider: "openai", llmModel: "gpt-4o-mini" }), false);
  assert.equal(core.isOllamaNativeEnabled({ llmProvider: "anthropic" }), false);
});

test("buildOllamaNativeBody: num_ctx e keep_alive vão onde o Ollama LÊ", () => {
  const b = core.buildOllamaNativeBody(
    { llmModel: "qwen2.5:14b", openaiNumCtx: 8192, openaiKeepAlive: "30m" },
    "SYS", "USER", 1024, true
  );
  // é exatamente isso que o /v1 descartava em silêncio
  assert.equal(b.options.num_ctx, 8192);
  assert.equal(b.keep_alive, "30m");
  assert.equal(b.options.num_predict, 1024);
  assert.equal(b.options.temperature, 0);
  assert.equal(b.stream, false, "streaming quebraria o parser de lote");
  assert.equal(b.format, "json", "lote precisa de saída JSON forçada");
  assert.equal(b.messages[0].role, "system");
  assert.equal(b.messages[1].content, "USER");

  // item a item não força JSON (a resposta é texto cru)
  assert.equal(core.buildOllamaNativeBody({ llmModel: "x" }, "S", "U", 512, false).format, undefined);
  // sem modelo configurado, cai num padrão em vez de mandar vazio
  assert.ok(core.buildOllamaNativeBody({}, "S", "U", 512, false).model.length > 0);
});

test("extractOllamaNativeText: lê o formato nativo (message.content)", () => {
  assert.equal(core.extractOllamaNativeText({ message: { content: "olá" } }), "olá");
  assert.equal(core.extractOllamaNativeText({ response: "olá" }), "olá", "aceita /api/generate por segurança");
  assert.equal(core.extractOllamaNativeText({}), null);
  assert.equal(core.extractOllamaNativeText(null), null);
});

test("Ollama nativo: pipeline de proteção intacto ponta a ponta", async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, body });
    const items = JSON.parse(body.messages[1].content).items;
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: { content: JSON.stringify({ translations: items.map((t) => t.replace("Wait", "Espere")) }) } }),
    };
  };
  try {
    const settings = {
      engine: "llm", llmProvider: "openai", llmApiKey: "ollama", llmModel: "qwen2.5:14b",
      openaiBaseUrl: "http://localhost:11434/v1/chat/completions",
      openaiNumCtx: 8192, openaiKeepAlive: "30m",
    };
    const pns = [{ term: "Thors", translation: "Academia Thors" }];
    const out = await core.translateBatchViaLLM(["Wait...#B_0Thors is here"], settings, pns, {});

    // foi pro endpoint NATIVO, com os parâmetros que o /v1 ignorava
    assert.equal(calls[0].url, "http://localhost:11434/api/chat");
    assert.equal(calls[0].body.options.num_ctx, 8192);
    assert.equal(calls[0].body.keep_alive, "30m");

    // e a proteção continua valendo igual
    assert.match(out[0], /#B_0/, "código do jogo tem que voltar");
    assert.ok(!/§\d+§/.test(out[0]), "nenhum marcador pode vazar");
    assert.match(out[0], /Academia Thors/, "glossário fixo continua reforçado");
  } finally {
    global.fetch = original;
  }
});

test("Ollama nativo: lote desalinhado cai no fallback em vez de gravar errado", async () => {
  const original = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    // devolve 1 item quando foram pedidos 2 — é o cenário que gravaria
    // tradução na linha errada se ninguém validasse a contagem
    json: async () => ({ message: { content: JSON.stringify({ translations: ["só um"] }) } }),
  });
  try {
    const settings = {
      engine: "llm", llmProvider: "openai", llmApiKey: "ollama", llmModel: "qwen2.5",
      openaiBaseUrl: "http://localhost:11434/v1/chat/completions",
    };
    await assert.rejects(
      () => core.translateBatchViaLLM(["um", "dois"], settings, [], {}),
      /2|item/i,
      "contagem errada tem que virar erro, não tradução trocada"
    );
  } finally {
    global.fetch = original;
  }
});

test("Ollama nativo: erro HTTP é classificado igual aos outros motores", async () => {
  const original = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500, headers: { get: () => null }, json: async () => ({ error: "modelo travou" }) });
  try {
    const settings = { llmProvider: "openai", llmModel: "qwen2.5", openaiBaseUrl: "http://localhost:11434/v1/chat/completions" };
    await assert.rejects(
      () => core.callOllamaNative(settings, "S", "U", 512, false),
      (e) => e.status === 500 && e.retryable === true,
      "5xx tem que ser recuperável, pra entrar no backoff"
    );
  } finally {
    global.fetch = original;
  }
});

test("REGRESSÃO: reforço de glossário funciona com código do jogo colado no termo", () => {
  // O bug: enforceFixedGlossaryTerms rodava DEPOIS de restoreCodes. Com o
  // código já restaurado e grudado no termo, o \b não achava fronteira —
  // porque o "0" de "#B_0" e o "T" de "Thors" são ambos caractere de
  // palavra. E falhava de forma INTERMITENTE: com "#E[12]" funcionava
  // (o "]" não é caractere de palavra), com "#M_4"/"#B_0" não.
  const pns = [{ term: "Thors", translation: "Academia Thors" }];

  // com o marcador (ordem correta: enforce ANTES do restore) sempre funciona
  assert.equal(
    core.enforceFixedGlossaryTerms("Espere...§0§Thors is here", pns),
    "Espere...§0§Academia Thors is here"
  );

  // demonstra o motivo do bug: com o código já restaurado, não há fronteira
  assert.equal(
    core.enforceFixedGlossaryTerms("Espere...#B_0Thors is here", pns),
    "Espere...#B_0Thors is here",
    "documenta POR QUE o enforce tem que rodar antes do restore"
  );
});

test("REGRESSÃO: pipeline completo aplica o glossário mesmo com código colado", async () => {
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    const items = JSON.parse(body.messages[1].content).items;
    // devolve igualzinho: o termo em inglês sobrevive e o reforço tem que agir
    return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify({ translations: items }) } }) };
  };
  try {
    const settings = {
      engine: "llm", llmProvider: "openai", llmApiKey: "ollama", llmModel: "qwen2.5",
      openaiBaseUrl: "http://localhost:11434/v1/chat/completions",
    };
    const pns = [{ term: "Thors", translation: "Academia Thors" }];
    // "#M_4" termina em dígito — o caso que falhava antes
    const out = await core.translateBatchViaLLM(["#M_4Thors is here"], settings, pns, {});
    assert.match(out[0], /Academia Thors/, "o termo tem que ser reforçado mesmo colado no código");
    assert.match(out[0], /#M_4/, "e o código tem que continuar lá, intacto");
  } finally {
    global.fetch = original;
  }
});

// ---------------------------------------------------------------------------
// QA de idioma: tradução em idioma errado + fim do falso positivo
// ---------------------------------------------------------------------------

test("findNonLatinChars: detecta escrita que nunca deveria aparecer numa tradução pt-BR", () => {
  assert.deepEqual(core.findNonLatinChars("Por favor, tenha cuidado."), [], "português limpo não acusa nada");
  assert.deepEqual(core.findNonLatinChars("Rean & Alisa — 100% (ok!)"), [], "acento, símbolo e travessão são latinos");
  assert.ok(core.findNonLatinChars("请注意安全").length > 0, "chinês");
  assert.ok(core.findNonLatinChars("こんにちは").length > 0, "japonês");
  assert.ok(core.findNonLatinChars("안녕하세요").length > 0, "coreano");
  assert.ok(core.findNonLatinChars("Пожалуйста").length > 0, "cirílico");
  assert.ok(core.findNonLatinChars("مرحبا").length > 0, "árabe");
  // não repete caractere na lista (a mensagem do QA mostra os primeiros)
  const rep = core.findNonLatinChars("请请请注");
  assert.equal(rep.length, new Set(rep).size);
});

test("QA: tradução em outro idioma é CRÍTICA (bloqueia exportação)", () => {
  // caso real: modelo multilíngue respondeu em chinês em vez de português
  const entry = { ref: "H1975", original: "Please be careful.", codes: [], lineCount: 1, lang: "en" };
  const issues = core.checkEntryIssues(entry, "请注意安全。不要推挤或奔跑！", []);
  const wrong = issues.find((i) => i.type === "wrong-language");
  assert.ok(wrong, "tem que acusar idioma errado");
  assert.equal(wrong.severity, "critical", "gravar isso no jogo é lixo garantido — não pode ser só aviso");

  // não pode acusar DUAS vezes a mesma linha: chinês e inglês são o mesmo
  // tipo agora, e a evidência de escrita não-latina exclui a de semelhança
  assert.equal(issues.filter((i) => i.type === "wrong-language").length, 1);

  // português correto não acusa nada disso
  assert.deepEqual(
    core.checkEntryIssues(entry, "Por favor, tenha cuidado.", []).filter((i) => i.type === "wrong-language"),
    []
  );
});

test("QA: fim do falso positivo de 'ainda em inglês' em linha curta", () => {
  // Estes eram marcados como inglês antes (10% de falso positivo medido):
  // linhas curtas onde o perfil de trigramas decidia no ruído.
  const casos = [
    ["Right.", "Certo."],
    ["Sure.", "Claro."],
    ["I am sorry.", "Me desculpe."],
    ["Understood.", "Entendido."],
    ["Wait!", "Espere!"],
  ];
  for (const [original, traducao] of casos) {
    const issues = core.checkEntryIssues({ ref: "A", original, codes: [], lineCount: 1, lang: "en" }, traducao, []);
    assert.ok(
      !issues.some((i) => i.type === "wrong-language"),
      `"${traducao}" é português correto e não pode ser acusado de estar em inglês`
    );
  }
});

test("QA: continua pegando linha que passou SEM tradução", () => {
  const casos = [
    "Please be careful.",
    "Do not push or run!",           // "do" existe nas duas listas — a detecção empatava e deixava passar
    "I will go with you to the academy.",
    "Right.",                         // curta e intocada
  ];
  for (const texto of casos) {
    const issues = core.checkEntryIssues({ ref: "A", original: texto, codes: [], lineCount: 1, lang: "en" }, texto, []);
    assert.ok(
      issues.some((i) => i.type === "wrong-language"),
      `"${texto}" está idêntica ao original e TEM que ser acusada`
    );
  }
});

test("detectLanguage: não chuta idioma em texto curto demais", () => {
  // Duas correções agindo juntas aqui:
  // 1) o vocabulário de diálogo agora reconhece fala curta comum, então
  //    "Certo."/"Claro." são identificadas como português DE VERDADE, em vez
  //    de caírem no trigrama e virarem "en" (era esse o falso positivo);
  assert.equal(core.detectLanguage("Certo."), "pt");
  assert.equal(core.detectLanguage("Claro."), "pt");

  // 2) quando NENHUMA palavra é reconhecida e o texto é curto demais pro
  //    perfil de trigramas significar algo, a resposta honesta é "unknown" —
  //    que nunca vira aviso nem é pulado do lote automático.
  assert.equal(core.detectLanguage("Hmm..."), "unknown");
  assert.equal(core.detectLanguage("Alisa!"), "unknown");
  assert.equal(core.detectLanguage("Grr!"), "unknown");

  // com amostra suficiente, volta a decidir normalmente
  assert.equal(core.detectLanguage("Claro que sim, podemos ir agora."), "pt");
  assert.equal(core.detectLanguage("I will go with you to the academy today."), "en");
});

// ---------------------------------------------------------------------------
// Quebra de linha: consertar a contagem sem estragar a leitura
// ---------------------------------------------------------------------------

test("splitIntoSentences: separa por frase, não por ponto solto", () => {
  assert.deepEqual(
    core.splitIntoSentences("Por favor, tenha cuidado. Não empurre nem corra!"),
    ["Por favor, tenha cuidado.", "Não empurre nem corra!"]
  );
  // reticências são UM fim de frase, não três
  assert.deepEqual(core.splitIntoSentences("Espere... Não vá!"), ["Espere...", "Não vá!"]);
  assert.deepEqual(core.splitIntoSentences("Espere… Não vá!"), ["Espere…", "Não vá!"]);
  // ponto que faz parte de código do jogo NÃO é fim de frase
  assert.deepEqual(core.splitIntoSentences("#M_.Vamos logo"), ["#M_.Vamos logo"]);
  // sem pontuação final, é tudo uma frase
  assert.deepEqual(core.splitIntoSentences("sem pontuacao aqui"), ["sem pontuacao aqui"]);
  assert.deepEqual(core.splitIntoSentences(""), []);
});

test("wrapToLineCount: quebra onde a frase termina", () => {
  // Era o defeito: quebrava por contagem de caracteres e saía
  // "Por favor, tenha / cuidado. Não empurre nem corra!" — cabia nas 2
  // linhas mas lia mal e não correspondia ao original.
  assert.equal(
    core.wrapToLineCount("Por favor, tenha cuidado. Não empurre nem corra!", 2),
    "Por favor, tenha cuidado.\nNão empurre nem corra!"
  );
  assert.equal(
    core.wrapToLineCount("Espere... Não vá embora ainda!", 2),
    "Espere...\nNão vá embora ainda!"
  );
  // com código do jogo na frente, o código fica colado onde estava
  assert.equal(
    core.wrapToLineCount("#E[1]Por favor, tenha cuidado. Não empurre nem corra!", 2),
    "#E[1]Por favor, tenha cuidado.\nNão empurre nem corra!"
  );
});

test("wrapToLineCount: mais frases que linhas -> agrupa mantendo a ordem", () => {
  const r = core.wrapToLineCount("Uma. Duas. Três. Quatro.", 2);
  assert.equal(r.split("\n").length, 2);
  // nenhuma frase pode se perder nem trocar de lugar
  assert.equal(r.replace(/\n/g, " "), "Uma. Duas. Três. Quatro.");

  const r3 = core.wrapToLineCount("A. B. C. D. E.", 3);
  assert.equal(r3.split("\n").length, 3);
  assert.equal(r3.replace(/\n/g, " "), "A. B. C. D. E.");
});

test("wrapToLineCount: sem pontuação, cai no equilíbrio por palavras (comportamento antigo)", () => {
  const r = core.wrapToLineCount("uma frase longa sem nenhuma pontuacao de fim aqui", 2);
  assert.equal(r.split("\n").length, 2);
  // não pode cortar palavra no meio
  for (const linha of r.split("\n")) assert.ok(linha.trim().length > 0);
  assert.equal(r.replace(/\n/g, " "), "uma frase longa sem nenhuma pontuacao de fim aqui");
});

test("wrapToLineCount: texto curto demais não é forçado a quebrar", () => {
  assert.equal(core.wrapToLineCount("Curta.", 2), "Curta.");
  assert.equal(core.wrapToLineCount("", 2), "");
  assert.equal(core.wrapToLineCount("qualquer coisa", 1), "qualquer coisa");
});

test("wrapToLineCount: o conserto realmente zera o aviso do QA", () => {
  const entry = { ref: "H1975", original: "Please be careful.\nDon't push or run!", codes: [], lineCount: 2, lang: "en" };
  const ruim = "Por favor, tenha cuidado. Não empurre nem corra!";
  assert.ok(
    core.checkEntryIssues(entry, ruim, []).some((i) => i.type === "line-mismatch"),
    "cenário de partida tem que ter o aviso"
  );
  const consertado = core.wrapToLineCount(ruim, entry.lineCount);
  assert.equal(
    core.checkEntryIssues(entry, consertado, []).filter((i) => i.type === "line-mismatch").length,
    0,
    "depois do conserto não pode sobrar aviso de linha"
  );
});

// ---------------------------------------------------------------------------
// Pedido do usuário: além do NÚMERO de linhas bater, a tradução deve ficar
// parecida com o original também na quantidade de PALAVRA por linha (uma
// linha curta no original vira uma linha proporcionalmente curta na
// tradução). originalLineWordCounts extrai o "molde" do original;
// wrapProportionalToOriginal reparte por essa proporção; wrapToLineCount
// aceita esse molde como 3º argumento OPCIONAL — sem ele, cai no
// comportamento antigo (testes acima, todos ainda de 2 argumentos, continuam
// batendo sem mudar nada).
// ---------------------------------------------------------------------------
test("originalLineWordCounts: conta palavra por linha, linha vazia conta 0", () => {
  assert.deepEqual(core.originalLineWordCounts("Please be careful.\nDon't push or run!"), [3, 4]);
  assert.deepEqual(core.originalLineWordCounts("uma\nduas palavras\ntrês palavras aqui"), [1, 2, 3]);
  assert.deepEqual(core.originalLineWordCounts("linha um\n\nlinha três"), [2, 0, 2]);
  assert.deepEqual(core.originalLineWordCounts(""), [0]);
});

test("wrapProportionalToOriginal: reparte a tradução na MESMA proporção de palavra do original", () => {
  // original: linha 1 tem 1 palavra (10%), linha 2 tem 9 palavras (90%) de
  // um total de 10 -- a tradução (10 palavras) deve seguir a mesma
  // proporção: ~1 palavra na linha 1, ~9 na linha 2 (não 5/5).
  const words = "um dois tres quatro cinco seis sete oito nove dez".split(" ");
  const r = core.wrapProportionalToOriginal(words, [1, 9]);
  const [l1, l2] = r.split("\n");
  assert.equal(l1.split(" ").length, 1);
  assert.equal(l2.split(" ").length, 9);
  // nenhuma palavra perdida nem repetida
  assert.equal(r.replace(/\n/g, " "), words.join(" "));
});

test("wrapProportionalToOriginal: linha vazia no original vira linha vazia na tradução", () => {
  const words = "um dois tres quatro".split(" ");
  const r = core.wrapProportionalToOriginal(words, [2, 0, 2]);
  const lines = r.split("\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[1], ""); // linha do meio, vazia no original, fica vazia
  assert.equal(r.replace(/\n/g, " ").trim().split(/\s+/).length, 4); // nenhuma palavra perdida
});

test("wrapProportionalToOriginal: cada linha (não-vazia no original) recebe pelo menos 1 palavra", () => {
  // 3 linhas no original, só 3 palavras na tradução -- nenhuma pode ficar sem
  const r = core.wrapProportionalToOriginal(["a", "b", "c"], [1, 1, 1]);
  assert.deepEqual(r.split("\n"), ["a", "b", "c"]);
});

test("wrapToLineCount com molde do original (3º argumento): prioriza proporção de palavra sobre equilíbrio de caractere", () => {
  // sem pontuação de frase (cai direto na PREFERÊNCIA 2/3) -- original bem
  // desbalanceado entre as 2 linhas (1 palavra / 6 palavras)
  const original = "Ei\nvocê aí, espera um segundo por favor";
  const traducao = "Ei você aí espera um segundo por favor"; // 8 palavras, sem pontuação final
  const comMolde = core.wrapToLineCount(traducao, 2, core.originalLineWordCounts(original));
  const [l1, l2] = comMolde.split("\n");
  assert.equal(l1.split(" ").length, 1); // igual proporção da linha 1 do original (1 de 7)
  assert.equal(l2.split(" ").length, 7);

  // sem o 3º argumento, comportamento antigo (equilíbrio por caractere) —
  // continua funcionando exatamente como antes, sem quebrar chamadas velhas
  const semMolde = core.wrapToLineCount(traducao, 2);
  assert.equal(semMolde.split("\n").length, 2);
});

test("wrapToLineCount: molde do original também funciona no caso de 'mais frases que linhas' (antes ia por groupSentencesIntoLines)", () => {
  const original = "Wait.\nDon't go anywhere, please stay right here with me."; // 1 palavra / 10 palavras
  const traducao = "Espere. Não vá a lugar nenhum, por favor fique bem aqui comigo."; // 2 frases, 1 linha só
  const r = core.wrapToLineCount(traducao, 2, core.originalLineWordCounts(original));
  const [l1, l2] = r.split("\n");
  // a proporção de palavra por linha fica MUITO mais perto do original
  // (1/11) do que o agrupamento de frase antigo (que juntaria as 2 frases
  // inteiras, cada uma numa linha, ficando 2 palavras / 9 palavras)
  assert.ok(l1.split(" ").length <= 2, `linha 1 deveria ficar curta, veio "${l1}"`);
  assert.equal(r.replace(/\n/g, " "), traducao);
});

// Caso real reportado pelo usuário (print do L8237): a tradução tinha o
// MESMO número de frases que linhas (2 e 2), então a regra antiga de "uma
// frase por linha" vencia e ignorava o molde — mesmo o original tendo 7
// palavras / 7 palavras (bem equilibrado), saía 4 palavras / 12 palavras na
// tradução. Depois da correção de prioridade, o molde manda sempre que está
// disponível e válido, então esse caso agora fica bem mais equilibrado.
test("wrapToLineCount: molde vence 'mesmo número de frases que linhas' quando os dois desbalanceiam (bug real do usuário)", () => {
  const original = "#E[1]#M_A#B_0Especially at Thors. It's a prestigious, traditional\nschool founded by our most notable emperor.";
  const traducao = "#E[1]#M_A#B_0E especialmente no Thors. É uma escola prestigiada e tradicional fundada pelo nosso imperador mais notável.";
  // confirma a premissa do bug: a tradução tem 2 frases, igual ao lineCount
  assert.equal(core.splitIntoSentences(traducao.replace(/\s+/g, " ").trim()).length, 2);

  const molde = core.originalLineWordCounts(original);
  assert.deepEqual(molde, [7, 7]);

  const r = core.wrapToLineCount(traducao, 2, molde);
  const [l1, l2] = r.split("\n");
  const n1 = l1.split(" ").length;
  const n2 = l2.split(" ").length;
  // antes: 4 / 12 (bem torto). agora: perto de 8 / 8 (metade/metade, como
  // o original) -- a diferença entre as duas linhas não pode passar de 2
  assert.ok(Math.abs(n1 - n2) <= 2, `esperava linhas equilibradas (~8/8), veio ${n1}/${n2}`);
  // nada de palavra perdida, repetida ou fora de ordem
  assert.equal(r.replace(/\n/g, " "), traducao.replace(/\s+/g, " ").trim());
});

test("QA: inglês e outros idiomas agora são o MESMO tipo", () => {
  const entry = { ref: "A", original: "Please be careful.", codes: [], lineCount: 1, lang: "en" };

  // inglês -> aviso (pode ser proposital: nome próprio, sigla, grito)
  const ingles = core.checkEntryIssues(entry, "Please be careful.", []);
  const iss1 = ingles.find((i) => i.type === "wrong-language");
  assert.ok(iss1, "inglês tem que cair em wrong-language");
  assert.equal(iss1.severity, "warning", "não bloqueia exportação — dá pra ignorar linha a linha");

  // outro idioma -> crítico (não existe hipótese de ser proposital)
  const chines = core.checkEntryIssues(entry, "请注意安全", []);
  const iss2 = chines.find((i) => i.type === "wrong-language");
  assert.ok(iss2);
  assert.equal(iss2.severity, "critical");

  // português correto -> nada
  assert.deepEqual(
    core.checkEntryIssues(entry, "Por favor, tenha cuidado.", []).filter((i) => i.type === "wrong-language"),
    []
  );

  // o tipo antigo não pode mais existir em lugar nenhum
  for (const t of ["Please be careful.", "请注意安全", "Por favor, tenha cuidado."]) {
    assert.ok(!core.checkEntryIssues(entry, t, []).some((i) => i.type === "still-english"));
  }
});

test("migrateQaIgnored: avisos de inglês já ignorados continuam ignorados", () => {
  // Sem isto, quem já tinha ignorado avisos de "ainda em inglês" veria todos
  // eles voltarem depois da unificação, porque a chave gravada no progresso
  // não casaria mais com o tipo emitido.
  assert.deepEqual(
    core.migrateQaIgnored({ A1: { "still-english": true } }),
    { A1: { "wrong-language": true } }
  );
  // convive com outros tipos na mesma linha, sem perder nenhum
  assert.deepEqual(
    core.migrateQaIgnored({ A2: { "missing-code": true, "still-english": true, "glossary-mismatch": true } }),
    { A2: { "missing-code": true, "wrong-language": true, "glossary-mismatch": true } }
  );
  // já migrado passa igual (idempotente — roda a cada carregamento)
  const jaOk = { A3: { "wrong-language": true } };
  assert.deepEqual(core.migrateQaIgnored(jaOk), jaOk);
  // dado degenerado não pode derrubar o carregamento do arquivo
  assert.deepEqual(core.migrateQaIgnored(null), {});
  assert.deepEqual(core.migrateQaIgnored(undefined), {});
  assert.deepEqual(core.migrateQaIgnored({ A: null }), {});
});

// ---------------------------------------------------------------------------
// REGRESSÃO: linhas em português marcadas como "não está em português"
// (casos reais tirados de um QA com 520 avisos, a maioria falsa)
// ---------------------------------------------------------------------------

test("REGRESSÃO: linha dominada por nome próprio não é chutada como inglês", () => {
  // O trigrama SEMPRE devolvia um vencedor. Nestas linhas os dois perfis
  // ficam a ~9% um do outro — não há evidência de idioma nenhum, e o
  // "vencedor" era sorteio. Resultado: português marcado como inglês.
  for (const t of ["Oh, Instrutor Schwarzer...", "Ah, Instrutor Schwarzer.", "Instrutor Schwarzer..."]) {
    assert.equal(core.detectLanguage(t), "unknown", `"${t}" não tem evidência de idioma — não pode chutar`);
    const entry = { ref: "x", original: t, codes: [], lineCount: 1, lang: core.detectLanguage(t) };
    assert.deepEqual(
      core.checkEntryIssues(entry, t, []).filter((i) => i.type === "wrong-language"),
      [],
      `"${t}" está em português e não pode ser acusada`
    );
  }
});

test("REGRESSÃO: frase portuguesa longa é reconhecida como português", () => {
  const t = "E assumir aonde quer que nosso caminho nos leve.";
  assert.equal(core.detectLanguage(t), "pt");
  const entry = { ref: "x", original: t, codes: [], lineCount: 1, lang: "pt" };
  assert.equal(core.checkEntryIssues(entry, t, []).length, 0, "original em português com tradução igual: nada a acusar");
});

test("REGRESSÃO: caractere estranho solto vira AVISO, não crítico", () => {
  // Era crítico e BLOQUEAVA a exportação de uma linha perfeitamente em
  // português por causa de um único caractere perdido.
  const entry = { ref: "x", original: "Let us go to the academy now please", codes: [], lineCount: 1, lang: "en" };
  const iss = core.checkEntryIssues(entry, "Vamos para a Academia Thors agora mesmo hoje 请", []);
  const critico = iss.find((i) => i.severity === "critical");
  assert.ok(!critico, "um caractere solto não pode bloquear a exportação");
  assert.ok(iss.some((i) => i.type === "odd-chars"), "mas vale um aviso pra revisão");
});

test("REGRESSÃO: letra grega é símbolo de jogo, não idioma", () => {
  // Ω, α, β e π aparecem em nome de item/habilidade o tempo todo.
  const entry = { ref: "x", original: "Special Omega item for the final battle", codes: [], lineCount: 1, lang: "en" };
  assert.deepEqual(
    core.checkEntryIssues(entry, "Item Ω especial do Rean para a batalha final", []).filter((i) => i.type === "wrong-language" || i.type === "odd-chars"),
    []
  );
});

test("isWrongScript: exige presença de verdade, não um caractere perdido", () => {
  assert.equal(core.isWrongScript("请注意安全"), true, "texto inteiro em chinês");
  assert.equal(core.isWrongScript("Пожалуйста, будьте осторожны"), true, "texto inteiro em russo");
  assert.equal(core.isWrongScript("Vamos para a Academia Thors agora mesmo hoje 请"), false, "1 caractere em ~45");
  assert.equal(core.isWrongScript("Por favor, tenha cuidado."), false);
  assert.equal(core.isWrongScript(""), false);
  // dois caracteres numa frase curta JÁ é proporção suficiente
  assert.equal(core.isWrongScript("请注"), true);
});

test("palavra que existe nos dois idiomas não conta como evidência", () => {
  // "Do not push or run!" tinha "do" (português) contra "not" (inglês),
  // empatava 1-1, virava "unknown" e a linha NÃO TRADUZIDA escapava do QA.
  assert.equal(core.detectLanguage("Do not push or run!"), "en");
  const entry = { ref: "x", original: "Do not push or run!", codes: [], lineCount: 1, lang: "en" };
  assert.ok(
    core.checkEntryIssues(entry, "Do not push or run!", []).some((i) => i.type === "wrong-language"),
    "linha idêntica ao original em inglês TEM que ser acusada"
  );
});

// ---------------------------------------------------------------------------
// Linha verificada: só crítico continua alertando
// ---------------------------------------------------------------------------

function docDeTeste(verified) {
  return {
    id: 1,
    fileName: "a.xlsx",
    project: "CS3",
    ignored: {},
    qaIgnored: {},
    entries: [
      { ref: "A1", original: "Please be careful.", codes: [], lineCount: 1, lang: "en" },
      { ref: "A2", original: "#E[1]Hello there", codes: core.extractCodes("#E[1]Hello there"), lineCount: 1, lang: "en" },
      { ref: "A3", original: "Line one\nLine two", codes: [], lineCount: 2, lang: "en" },
      { ref: "A4", original: "Please be careful.", codes: [], lineCount: 1, lang: "en" },
    ],
    translations: {
      A1: "Please be careful.",   // aviso: não traduzida
      A2: "Olá pessoal",          // CRÍTICO: perdeu o #E[1]
      A3: "Uma linha só",         // aviso: contagem de linha
      A4: "请注意安全",             // CRÍTICO: outro idioma
    },
    verified: verified || {},
  };
}

test("verificada: avisos somem, crítico permanece", () => {
  const semVerificar = core.runQualityCheck([docDeTeste()], []);
  assert.equal(semVerificar.length, 4, "sem verificar, tudo aparece");

  const tudoVerificado = core.runQualityCheck([docDeTeste({ A1: true, A2: true, A3: true, A4: true })], []);
  // Aprovar uma linha é dizer "li e aprovo" — os avisos já foram vistos.
  // Repetir "parece estar em inglês" numa linha aprovada de propósito só
  // enche a lista e faz o QA perder credibilidade.
  assert.deepEqual(tudoVerificado.map((r) => r.ref).sort(), ["A2", "A4"], "só os críticos sobram");
  for (const r of tudoVerificado) {
    for (const iss of r.issues) {
      assert.equal(iss.severity, "critical", "nenhum aviso pode sobreviver numa linha verificada");
    }
  }
});

test("verificada NÃO esconde crítico — código faltando pode ter passado sem a pessoa ver", () => {
  const doc = docDeTeste({ A2: true });
  const res = core.runQualityCheck([doc], []);
  const a2 = res.find((r) => r.ref === "A2");
  assert.ok(a2, "linha verificada com código ausente TEM que continuar aparecendo");
  assert.equal(a2.issues[0].severity, "critical");
  assert.equal(a2.verified, true, "e o painel sabe que ela está verificada");
});

test("verificada de uma linha não afeta as outras", () => {
  const res = core.runQualityCheck([docDeTeste({ A1: true })], []);
  assert.deepEqual(res.map((r) => r.ref).sort(), ["A2", "A3", "A4"]);
});

// ---------------------------------------------------------------------------
// Integridade da resposta: marcador mutilado, código inventado, idioma errado
// (caso real: qwen2.5:7b devolveu "§0T#1C#1CTch... Entendi!")
// ---------------------------------------------------------------------------

test("restoreCodesTolerant: recupera código quando o modelo come o § de fechamento", () => {
  const original = "#4K#F#2UTch... Got it!";
  const { tokens } = core.protectCodes(original);
  // o modelo devolveu "§0" em vez de "§0§" — o restore normal não casa
  assert.match(core.restoreCodes("§0T... Entendi!", tokens), /§0/, "o restore estrito realmente não recupera");
  // o tolerante recupera, porque "§" nunca existe no texto do jogo:
  // qualquer "§" seguido de dígito só pode ser marcador nosso
  assert.equal(core.restoreCodesTolerant("§0T... Entendi!", tokens), "#4K#F#2UT... Entendi!");
  // e a forma correta continua funcionando igual
  assert.equal(core.restoreCodesTolerant("§0§ T... Entendi!", tokens), "#4K#F#2UT... Entendi!");
});

test("findLeakedMarkers: acha marcador de proteção que sobrou", () => {
  assert.deepEqual(core.findLeakedMarkers("texto limpo"), []);
  assert.ok(core.findLeakedMarkers("§0T#1C").length > 0, "§ mutilado");
  assert.ok(core.findLeakedMarkers("§0§ resto").length > 0, "§ inteiro");
  assert.ok(core.findLeakedMarkers("¤1¤ nome").length > 0, "marcador de nome próprio");
  assert.ok(core.findLeakedMarkers("‡2‡ pontuação").length > 0, "marcador de pontuação");
});

test("findInventedCodes: acha código que o modelo criou do nada", () => {
  // o caso real: original tem #4K #F #2U, o modelo devolveu #1C#1C
  assert.deepEqual(core.findInventedCodes("#4K#F#2UTch", "#4K#F#2UT#1C#1C"), ["#1C"]);
  // sem invenção, lista vazia
  assert.deepEqual(core.findInventedCodes("#4K Olá", "#4K Oi"), []);
  // repetir MAIS vezes que o original também é invenção
  const extra = core.findInventedCodes("#K uma vez", "#K#K duas vezes");
  assert.equal(extra.length, 1);
  assert.match(extra[0], /#K/);
  // usar MENOS vezes não é invenção (isso é o check de código ausente)
  assert.deepEqual(core.findInventedCodes("#K#K duas", "#K uma"), []);
});

test("validateTranslationIntegrity: é o porteiro antes de gravar", () => {
  const original = "#4K#F#2UTch... Got it!";
  // resposta boa passa
  assert.equal(core.validateTranslationIntegrity(original, "#4K#F#2UTch... Entendi!").ok, true);
  // marcador vazado é barrado
  assert.equal(core.validateTranslationIntegrity(original, "§0Tch... Entendi!").ok, false);
  // código inventado é barrado
  assert.equal(core.validateTranslationIntegrity(original, "#4K#F#2UT#1C#1C Entendi!").ok, false);
  // idioma errado é barrado
  assert.equal(core.validateTranslationIntegrity(original, "#4K#F#2U请注意安全").ok, false);
  // e a razão sempre explica o motivo (vai pro erro que dispara a retentativa)
  assert.ok(core.validateTranslationIntegrity(original, "§0Tch").reason.length > 0);
});

test("pipeline: código das PONTAS nem chega ao modelo", async () => {
  // A melhor proteção contra o modelo estragar um marcador é ele nunca
  // receber marcador. Aqui o original é '#4K#F#2UTch... Got it!' e o que sai
  // pela rede tem que ser só o texto — os códigos ficam guardados de fora.
  const original = global.fetch;
  let recebido = null;
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    recebido = JSON.parse(body.messages[1].content).items;
    // o "modelo" devolve lixo: marcador mutilado + código inventado
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: { content: JSON.stringify({ translations: ["§0T#1C#1CTch... Entendi!"] }) } }),
    };
  };
  try {
    const settings = {
      engine: "llm", llmProvider: "openai", llmApiKey: "ollama", llmModel: "qwen2.5",
      openaiBaseUrl: "http://localhost:11434/v1/chat/completions",
    };
    const out = await core.translateBatchViaLLM(["#4K#F#2UTch... Got it!"], settings, [], {});

    assert.deepEqual(recebido, ["Tch... Got it!"], "o modelo não pode ver código nem marcador");

    // mesmo com o modelo devolvendo lixo, os códigos saem EXATOS — porque
    // eles nunca dependeram da resposta dele
    assert.deepEqual(core.extractCodes(out[0]), ["#4K", "#F", "#2U"]);
    // e o lixo foi limpo em vez de derrubar a linha inteira
    assert.ok(!/§/.test(out[0]), "marcador órfão não pode sobrar");
    assert.ok(!/#1C/.test(out[0]), "código inventado não pode sobrar");
  } finally {
    global.fetch = original;
  }
});

test("pipeline: idioma errado (o único sem salvação) vira nova tentativa", async () => {
  const original = global.fetch;
  global.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ message: { content: JSON.stringify({ translations: ["请注意安全，不要推挤"] }) } }),
  });
  try {
    const settings = {
      engine: "llm", llmProvider: "openai", llmApiKey: "ollama", llmModel: "qwen2.5",
      openaiBaseUrl: "http://localhost:11434/v1/chat/completions",
    };
    await assert.rejects(
      () => core.translateBatchViaLLM(["Tch... Got it!"], settings, [], {}),
      /idioma/i,
      "não há como aproveitar uma resposta em chinês"
    );
  } finally {
    global.fetch = original;
  }
});

test("QA: marcador vazado e código inventado são CRÍTICOS", () => {
  const original = "#4K#F#2UTch... Got it!";
  const entry = { ref: "E3345", original, codes: core.extractCodes(original), lineCount: 1, lang: "en" };
  const issues = core.checkEntryIssues(entry, "§0T#1C#1CTch... Entendi!", []);
  const tipos = issues.map((i) => i.type);
  assert.ok(tipos.includes("leaked-marker"), "marcador vazado apareceria literalmente na tela do jogo");
  assert.ok(tipos.includes("invented-code"), "código inventado manda o jogo executar o que o roteiro não pedia");
  assert.ok(tipos.includes("missing-code"), "e os códigos reais sumiram");
  for (const i of issues) assert.equal(i.severity, "critical", "os três bloqueiam a exportação");

  // tradução correta não dispara nada disso
  assert.deepEqual(
    core.checkEntryIssues(entry, "#4K#F#2UTch... Entendi!", []).filter((i) =>
      ["leaked-marker", "invented-code", "missing-code"].includes(i.type)
    ),
    []
  );
});

test("prepareForLlm: tira os códigos das pontas, protege só o miolo", () => {
  // ponta na frente (o caso mais comum no jogo)
  const a = core.prepareForLlm("#4K#F#2UTch... Got it!");
  assert.equal(a.lead, "#4K#F#2U");
  assert.equal(a.protectedText, "Tch... Got it!", "nada de marcador vai pro modelo");
  assert.equal(a.tokens.length, 0);

  // ponta no fim
  const b = core.prepareForLlm("Hello there#K");
  assert.equal(b.trail, "#K");
  assert.equal(b.protectedText, "Hello there");

  // espaço entre o código e o texto tem que ser preservado na volta
  const cc = core.prepareForLlm("#E[1] Hello there");
  assert.equal(cc.protectedText, "Hello there");
  assert.equal(core.reassembleFromLlm(cc, "Olá pessoal"), "#E[1] Olá pessoal");

  // código no MEIO ainda precisa de marcador (a posição depende do texto)
  const d = core.prepareForLlm("Hello#M_2World");
  assert.equal(d.tokens.length, 1);
  assert.match(d.protectedText, /§0§/);

  // linha que é SÓ código não vai pro modelo
  const e = core.prepareForLlm("#E[1]#K");
  assert.equal(e.nothingToTranslate, true);

  // sem código nenhum, passa direto
  const f = core.prepareForLlm("Sem código nenhum");
  assert.equal(f.protectedText, "Sem código nenhum");
  assert.equal(f.nothingToTranslate, false);
});

test("reassembleFromLlm: recola as pontas exatamente como estavam", () => {
  const p = core.prepareForLlm("#4K#F#2UTch... Got it!");
  assert.equal(core.reassembleFromLlm(p, "Tch... Entendi!"), "#4K#F#2UTch... Entendi!");
  // colado sem espaço no original continua colado
  assert.ok(!/#2U /.test(core.reassembleFromLlm(p, "Tch... Entendi!")));
});

test("sanitizeTranslation: limpa o ruído em vez de jogar a tradução fora", () => {
  // marcador órfão some
  assert.equal(core.sanitizeTranslation("Olá", "§0 Olá"), "Olá");
  assert.equal(core.sanitizeTranslation("Olá", "¤1¤ Olá ‡2‡"), "Olá");
  // código inventado some, código legítimo fica
  assert.equal(core.sanitizeTranslation("#4K Tch", "#4K Tch #1C"), "#4K Tch");
  // repetição a mais some, a permitida fica
  assert.equal(core.sanitizeTranslation("#K uma", "#K#K uma"), "#K uma");
  // tradução limpa não é alterada
  assert.equal(core.sanitizeTranslation("#4K Tch", "#4K Tch"), "#4K Tch");
  // e nunca inventa nada: os códigos de saída são subconjunto do original
  const out = core.sanitizeTranslation("#4K#F Olá", "#4K#F#9Z Olá");
  for (const cod of core.extractCodes(out)) assert.ok(["#4K", "#F"].includes(cod));
});

// ---------------------------------------------------------------------------
// Prompt: regra de marcador condicional (bug de priming)
// ---------------------------------------------------------------------------

test("prompt não menciona § quando a entrada não tem marcador", () => {
  // BUG DE PRIMING: desde que os códigos das pontas passaram a ser
  // arrancados antes do envio, a maioria das requisições vai SEM marcador.
  // Continuar explicando "§0§" em detalhe ensinava o modelo pequeno a
  // produzir "§" — e ele passava a inventar marcador que ninguém pediu.
  const semMarcador = core.buildLlmSystemPrompt([], [], { hasMarkers: false });
  const comMarcador = core.buildLlmSystemPrompt([], [], { hasMarkers: true });

  assert.ok((semMarcador.match(/§/g) || []).length <= 1, "quase nenhuma menção a § quando não há marcador");
  assert.ok((comMarcador.match(/§/g) || []).length >= 4, "com marcador, a regra detalhada volta");
  assert.match(semMarcador, /NÃO contém códigos técnicos/, "diz o contrário: não use símbolo nenhum");
  assert.match(comMarcador, /copie-os EXATAMENTE/);
});

test("prompt: a regra de formato é a ÚLTIMA linha (efeito de recência)", () => {
  const p = core.buildLlmSystemPrompt([{ term: "Thors", translation: "Academia Thors" }], [], { hasMarkers: false });
  const ultima = p.trim().split("\n").pop();
  assert.match(ultima, /^- RETORNE EXCLUSIVAMENTE/, "a restrição mais crítica fica colada ao ponto de geração");
  // e o exemplo negativo está presente
  assert.match(p, /NÃO fazer/);
  assert.match(p, /ERRADO/);
});

// ---------------------------------------------------------------------------
// Corpo da requisição nativa: schema, prefill e options
// ---------------------------------------------------------------------------

test("ollamaBatchSchema trava o TAMANHO do array, não só o formato", () => {
  const s = core.ollamaBatchSchema(20);
  assert.equal(s.properties.translations.minItems, 20);
  assert.equal(s.properties.translations.maxItems, 20);
  assert.deepEqual(s.required, ["translations"]);
  // é isso que elimina a classe de erro "veio 19, esperava 20": format:"json"
  // garantiria só JSON válido, e {"resultado": [...]} passaria
  assert.equal(s.properties.translations.items.type, "string");
});

test("buildOllamaNativeBody: prefill impede 'Claro, aqui está'", () => {
  const b = core.buildOllamaNativeBody({ llmModel: "qwen2.5" }, "SYS", '{"items":["a"]}', 512, true, 1);
  const ultima = b.messages[b.messages.length - 1];
  assert.equal(ultima.role, "assistant");
  assert.equal(ultima.content, core.OLLAMA_JSON_PREFILL);
  // a resposta já COMEÇA dentro do JSON — não há espaço físico pra cortesia
  assert.match(ultima.content, /^\{"translations": \[/);

  // no modo item a item (texto cru) não há prefill
  const cru = core.buildOllamaNativeBody({ llmModel: "qwen2.5" }, "SYS", "texto", 512, false);
  assert.equal(cru.messages[cru.messages.length - 1].role, "user");
});

test("buildOllamaNativeBody: num_predict nunca estoura o num_ctx", () => {
  // Com lote de 20 a fórmula pedia 6400 contra 8192 de contexto, sobrando
  // quase nada pro prompt — e o Ollama TRUNCA EM SILÊNCIO quando não cabe.
  const b = core.buildOllamaNativeBody({ llmModel: "q", openaiNumCtx: 8192 }, "SYS", "U", 6400, true, 20);
  assert.ok(b.options.num_predict < 6400, "tem que ser limitado");
  assert.ok(b.options.num_predict <= 8192 * 0.6);
  // contexto pequeno aperta ainda mais
  const p = core.buildOllamaNativeBody({ llmModel: "q", openaiNumCtx: 2048 }, "SYS", "U", 6400, true, 20);
  assert.ok(p.options.num_predict <= 2048 * 0.6);
  // pedido modesto passa intacto
  const ok = core.buildOllamaNativeBody({ llmModel: "q", openaiNumCtx: 8192 }, "SYS", "U", 512, false);
  assert.equal(ok.options.num_predict, 512);
});

test("buildOllamaNativeBody: options que evitam resposta degenerada", () => {
  const b = core.buildOllamaNativeBody({ llmModel: "qwen2.5" }, "SYS", "U", 512, false);
  // o que mais evita loop em 7B quantizado com temperature 0
  assert.equal(b.options.repeat_penalty, 1.1);
  assert.equal(b.options.seed, 7, "determinismo entre execuções");
  assert.equal(b.options.temperature, 0);
  assert.equal(b.options.top_p, 1);
  assert.ok(Array.isArray(b.options.stop));
});

test("extractOllamaNativeText: erro claro quando o modelo só 'pensa'", () => {
  assert.equal(core.extractOllamaNativeText({ message: { content: "olá" } }), "olá");
  // modelo de raciocínio com content vazio: mensagem que diz o que fazer,
  // em vez do vago "resposta vazia/inválida"
  assert.throws(
    () => core.extractOllamaNativeText({ message: { content: "", thinking: "hmm deixa eu ver" } }),
    /raciocínio interno/
  );
  assert.equal(core.extractOllamaNativeText({}), null);
});

// ---------------------------------------------------------------------------
// Tolerância restrita + invariantes do pipeline de códigos
// ---------------------------------------------------------------------------

test("restoreCodesTolerant não destrói §N legítimo já restaurado", () => {
  // Cenário do falso positivo: dois códigos; o "§0§" foi restaurado
  // corretamente e o texto contém por acaso um "§1" comum.
  const { tokens } = core.protectCodes("#E[1]Olá#K");
  assert.equal(tokens.length, 2);
  const entrada = "§0§ Olá §1§";
  const ok = core.restoreCodesTolerant(entrada, tokens);
  assert.ok(!/§/.test(ok), "os dois foram restaurados pelo passe estrito");

  // agora um caso em que só o token 0 foi restaurado e sobra um "§1" que é
  // texto de verdade... como o token 1 está PENDENTE, ele é restaurado —
  // comportamento correto: perder um código é pior que trocar um símbolo raro
  const soUm = core.restoreCodesTolerant("§0§ Olá", tokens);
  assert.match(soUm, /#E\[1\]/);
});

test("restoreCodesTolerant: índice inexistente nunca é tocado", () => {
  const { tokens } = core.protectCodes("#K só um");
  assert.equal(tokens.length, 1);
  const r = core.restoreCodesTolerant("§9 texto qualquer", tokens);
  assert.match(r, /§9/, "não existe token 9 — tem que ficar como está");
});

test("INVARIANTE: a remontagem preserva exatamente a colagem do original", () => {
  for (const orig of ["#E[1]Olá", "#E[1] Olá", "Olá#K", "Olá #K", "#4K#F#2UTch"]) {
    const p = core.prepareForLlm(orig);
    // "tradução" = o próprio texto enviado, pra isolar só a remontagem
    const volta = core.reassembleFromLlm(p, p.protectedText);
    assert.equal(volta, orig, `colagem alterada em ${JSON.stringify(orig)}`);
  }
});

test("INVARIANTE: a SEQUÊNCIA de códigos sobrevive ao pipeline", () => {
  for (const orig of ["#E[1]Hello#M_2World#K", "#4K#F#2UTch... Got it!", "Hello#K", "sem código"]) {
    const p = core.prepareForLlm(orig);
    const volta = core.reassembleFromLlm(p, p.protectedText);
    assert.deepEqual(
      core.extractCodes(volta),
      core.extractCodes(orig),
      `ordem/quantidade mudou em ${JSON.stringify(orig)}`
    );
  }
});

// ---------------------------------------------------------------------------
// Log de diagnóstico do QA (pra colar numa IA)
// ---------------------------------------------------------------------------

function qaDocDiag() {
  const orig = "#4K#F#2UTch... Got it!";
  return {
    id: 1, fileName: "A0302.XLSX", project: "CS3", ignored: {}, qaIgnored: {},
    entries: [
      { ref: "E3345", original: orig, codes: core.extractCodes(orig), lineCount: 1, lang: "en" },
      { ref: "E585", original: "Please be careful.", codes: [], lineCount: 1, lang: "en" },
      { ref: "N857", original: "Line one\nLine two", codes: [], lineCount: 2, lang: "en" },
    ],
    translations: {
      E3345: "§0T#1C#1CTch... Entendi!",  // marcador vazado + código inventado + faltando
      E585: "Please be careful.",          // não traduzida
      N857: "Uma linha só",                // contagem de linha
    },
    verified: {},
  };
}

test("diagnóstico: a chave de API NUNCA entra no arquivo", () => {
  // Este arquivo existe pra ser compartilhado — chave em log é como chave vaza.
  const items = core.runQualityCheck([qaDocDiag()], []);
  const rel = core.buildQaDiagnostic(
    { items, scope: "file" },
    { llmApiKey: "sk-SEGREDO-NAO-PODE-VAZAR", llmProvider: "openai", llmModel: "qwen2.5" },
    {}
  );
  const texto = JSON.stringify(rel);
  assert.ok(!texto.includes("SEGREDO"), "a chave vazou pro relatório");
  assert.ok(!texto.includes("sk-"), "nenhum fragmento de chave pode aparecer");
  assert.match(rel.ambiente.chaveDeApi, /removida/);
});

test("diagnóstico: contagem é sobre o TOTAL, amostra é limitada", () => {
  // Muitos itens do mesmo tipo: a contagem tem que refletir todos, a amostra não.
  const doc = qaDocDiag();
  doc.entries = [];
  doc.translations = {};
  for (let i = 0; i < 50; i++) {
    doc.entries.push({ ref: "L" + i, original: "Please be careful.", codes: [], lineCount: 1, lang: "en" });
    doc.translations["L" + i] = "Please be careful.";
  }
  const items = core.runQualityCheck([doc], []);
  const rel = core.buildQaDiagnostic({ items, scope: "file" }, {}, {});

  assert.equal(rel.contagens.linhasComProblema, 50, "a contagem vale sobre o total");
  assert.equal(rel.contagens.porTipo["wrong-language"], 50);
  assert.equal(
    rel.amostras["wrong-language"].length,
    core.QA_DIAG_AMOSTRAS_POR_TIPO,
    "a amostra é limitada — 50 exemplos iguais não acrescentam informação e estouram o contexto da IA"
  );
});

test("diagnóstico: leva o ambiente, que é o que permite responder 'por quê'", () => {
  const items = core.runQualityCheck([qaDocDiag()], []);
  const rel = core.buildQaDiagnostic(
    { items, scope: "all" },
    {
      engine: "llm", llmProvider: "openai", llmModel: "qwen2.5:7b-instruct-q4_K_M",
      openaiBaseUrl: "http://localhost:11434/v1/chat/completions",
      openaiNumCtx: 8192, openaiKeepAlive: "30m",
      openaiLocalBatchSize: 20, openaiLocalConcurrency: 2,
    },
    { totalArquivos: 317, totalLinhas: 12000, totalGlossario: 250 }
  );
  assert.equal(rel.ambiente.modelo, "qwen2.5:7b-instruct-q4_K_M");
  assert.equal(rel.ambiente.servidorLocal, true);
  assert.equal(rel.ambiente.apiNativaOllama, true);
  assert.equal(rel.ambiente.numCtx, 8192);
  assert.equal(rel.ambiente.linhasPorRequisicao, 20);
  assert.equal(rel.escopo.arquivosAnalisados, 317);
  assert.equal(rel.escopo.termosNoGlossario, 250);
  // sem essas informações, quem analisa o log só consegue chutar
});

test("diagnóstico: amostra traz o que explica o problema sem precisar perguntar", () => {
  const items = core.runQualityCheck([qaDocDiag()], []);
  const rel = core.buildQaDiagnostic({ items, scope: "file" }, {}, {});
  const amostra = rel.amostras["missing-code"][0];
  assert.equal(amostra.arquivo, "A0302.XLSX");
  assert.equal(amostra.celula, "E3345");
  assert.ok(amostra.original.length > 0);
  assert.ok(amostra.traducao.length > 0);
  assert.ok(amostra.detalhe.length > 0);
  // a comparação dos códigos é o que mostra o padrão de uma olhada
  assert.deepEqual(amostra.codigosNoOriginal, ["#4K", "#F", "#2U"]);
  assert.ok(Array.isArray(amostra.codigosNaTraducao));
  assert.equal(typeof amostra.verificadaPorHumano, "boolean");
});

test("diagnóstico: texto gigante é cortado pra não estourar o contexto", () => {
  const gigante = "palavra ".repeat(500);
  const doc = {
    id: 1, fileName: "X.XLSX", project: "P", ignored: {}, qaIgnored: {},
    entries: [{ ref: "A1", original: gigante, codes: [], lineCount: 1, lang: "en" }],
    translations: { A1: gigante },
    verified: {},
  };
  const items = core.runQualityCheck([doc], []);
  const rel = core.buildQaDiagnostic({ items, scope: "file" }, {}, {});
  const a = rel.amostras["wrong-language"][0];
  assert.ok(a.original.length <= core.QA_DIAG_MAX_TEXTO + 20);
  assert.match(a.original, /cortado/);
});

test("diagnóstico: sem resultado de QA não explode", () => {
  const vazio = core.buildQaDiagnostic({ items: [], scope: "file" }, {}, {});
  assert.equal(vazio.contagens.linhasComProblema, 0);
  assert.deepEqual(vazio.amostras, {});
  // e aceita entrada degenerada sem quebrar
  assert.equal(core.buildQaDiagnostic(null, null, null).contagens.linhasComProblema, 0);
});
// ---------------------------------------------------------------------------
// Regressão: 2º relatório de QA (diagnostico-qa-CS3-20260805T033745Z.json)
// ---------------------------------------------------------------------------

test("glossário: plural irregular 'Filiais' não é mais falso positivo (bug meu, task 116)", () => {
  // Caso real do relatório: "the main and branch campuses" -> "as filiais e
  // a principal" era marcado como glossary-mismatch porque o regex antigo
  // só previa plural regular (s/es) e "Filial"->"Filiais" é irregular
  // (-al -> -ais). Não era erro de tradução, era falso positivo do QA.
  const pn = [{ term: "Branch", translation: "Filial" }];
  const origPlural = "#E_4#M_A#B_0I hope the tension between the main and\nbranch campuses goes away someday.";
  const tradPlural = "#E_4#M_A#B_0Espero que o conflito\nentre as filiais e a principal some um dia.";
  assert.deepEqual(core.findGlossaryMismatches(origPlural, tradPlural, pn), []);
  // continua pegando o caso real (termo realmente ausente na tradução)
  const original = "#KThis is Lau. He's the right hand man of the branch\nmanager, who's on leave at the moment. ";
  const traducaoRuim = "#KEste é Lau. Ele é o homem direto do\ngerente adjunto, que está de licença no momento.";
  assert.deepEqual(core.findGlossaryMismatches(original, traducaoRuim, pn), [{ term: "Branch", expected: "Filial" }]);
});

test("glossário: plural regular continua funcionando depois da mudança pro radical (task 116)", () => {
  const pn = [{ term: "Ashen Chevalier", translation: "Cavaleiro Cinzento" }];
  const original = "I was thinking... For a while, the Ashen\nChevalier was super popular.";
  const traducao = "Estava pensando... Por um tempo,\no Cavaleiros Cinzentos foi super popular.";
  assert.deepEqual(core.findGlossaryMismatches(original, traducao, pn), []);
});

test("codeCountRegrediu: código pareado #3C...#1C que sumiu no meio da frase (task 118)", () => {
  // Caso real do relatório: os dois códigos de destaque no meio da frase
  // (abre/fecha) viraram marcadores §N§ e o modelo devolveu só 1 dos 2.
  const original = "...to the #3Cbranch campus via the #3CQuick Travel Menu#1C.";
  const semCodigo = "...to the branch campus via the Quick Travel Menu.";
  assert.equal(core.codeCountRegrediu(original, semCodigo), true);
  assert.equal(core.codeCountRegrediu(original, original), false);
});

test("codeCountRegrediu: não acusa nada quando o original não tem código", () => {
  assert.equal(core.codeCountRegrediu("Hello there.", "Olá."), false);
});

test("temLoopDegenerativo: pega a repetição real do relatório, não a gagueira legítima (task 119)", () => {
  assert.equal(core.temLoopDegenerativo("E-Eh-- E-Eu-- E-Er-- De-De-De-De-De-De-De-Realmente?!"), true);
  // gagueira de verdade (1-2 repetições) não é loop
  assert.equal(core.temLoopDegenerativo("E-Eh, n-não sei..."), false);
  assert.equal(core.temLoopDegenerativo("Essa é uma frase perfeitamente normal."), false);
});

test("respostaMuitoCurtaParaOriginal: pega a alucinação real do relatório (task 119)", () => {
  // Caso real: original de 3 linhas sobre mel/sal virou "Cerveja seca... Certo!"
  const original = "The honey from Armorica, the salt from Bareahard...\nEven small towns like these have their own\nlocal specialties, don't they?";
  const alucinacao = "Cerveja seca... Certo!";
  assert.equal(core.respostaMuitoCurtaParaOriginal(original, alucinacao), true);
  // tradução normal (PT tende a ficar do tamanho do inglês ou maior) passa
  const traducaoNormal = "O mel de Armorica, o sal de Bareahard...\nAté cidadezinhas como essas têm suas\nprópias especialidades locais, não é?";
  assert.equal(core.respostaMuitoCurtaParaOriginal(original, traducaoNormal), false);
});

test("respostaMuitoCurtaParaOriginal: não acusa original curto (não dá pra distinguir de alucinação)", () => {
  assert.equal(core.respostaMuitoCurtaParaOriginal("Hi.", "Oi."), false);
});

test("findNonLatinChars: pega os 6 vazamentos de CJK reais do relatório (task 120)", () => {
  const amostras = [
    "Desculpe. Parece que eu também estou sem它们。",
    "#1PParece estar apenas chovendo um pouco, mas\nainda assim, fico aliviado por ter levado essa伞布。",
    "#E[1]#M_0#B_0É verdade que\neu me习惯了控制Claiomh Solais.",
    "#K#FEntendi, então você adicionou\numa decoração enquanto reforçava a布置场景。",
    "Estou tão aliviado que ele chegou em casa平安地.",
    "Não tenho certeza完全翻译为：Não tenho certeza completamente como isso aconteceu...\nmas o problema com a Mall Kleist foi resolvido.",
  ];
  for (const a of amostras) {
    assert.ok(core.findNonLatinChars(a).length > 0, `deveria achar CJK em: ${a}`);
  }
  // tradução limpa não acusa nada
  assert.equal(core.findNonLatinChars("Desculpe, também estou sem.").length, 0);
});
// ---------------------------------------------------------------------------
// Revisor de coerência (IA) — pedido explícito do usuário: "criar um
// revisor para verificar se a tradução está coerente com o original".
// ---------------------------------------------------------------------------

test("coherenceIssueSeverity: faixas de nota (0-39 crítico, 40-69 aviso, 70+ nada)", () => {
  assert.equal(core.coherenceIssueSeverity(100), null);
  assert.equal(core.coherenceIssueSeverity(70), null);
  assert.equal(core.coherenceIssueSeverity(69), "warning");
  assert.equal(core.coherenceIssueSeverity(40), "warning");
  assert.equal(core.coherenceIssueSeverity(39), "critical");
  assert.equal(core.coherenceIssueSeverity(0), "critical");
  assert.equal(core.coherenceIssueSeverity(NaN), null);
  assert.equal(core.coherenceIssueSeverity(undefined), null);
});

test("makeCoherenceIssue: nota boa não vira issue nenhum", () => {
  assert.equal(core.makeCoherenceIssue({ nota: 85, explicacao: "" }), null);
  assert.equal(core.makeCoherenceIssue(null), null);
});

test("makeCoherenceIssue: nota baixa vira issue com a nota e a explicação no detalhe", () => {
  const issue = core.makeCoherenceIssue({ nota: 15, explicacao: "omitiu que o personagem estava com raiva" });
  assert.equal(issue.severity, "critical");
  assert.equal(issue.type, "coherence-low");
  assert.match(issue.detail, /15\/100/);
  assert.match(issue.detail, /omitiu que o personagem estava com raiva/);
});

test("makeCoherenceIssue: sem explicação do modelo ainda dá um detalhe legível", () => {
  const issue = core.makeCoherenceIssue({ nota: 55, explicacao: "" });
  assert.equal(issue.severity, "warning");
  assert.match(issue.detail, /55\/100/);
  assert.ok(issue.detail.length > 20);
});

test("buildCoherenceReviewUserContent: monta pares numerados na ordem recebida", () => {
  const pairs = [
    { original: "Hello there.", traducao: "Olá." },
    { original: "Goodbye.", traducao: "Tchau." },
  ];
  const parsed = JSON.parse(core.buildCoherenceReviewUserContent(pairs));
  assert.equal(parsed.pares.length, 2);
  assert.deepEqual(parsed.pares[0], { id: 1, original: "Hello there.", traducao: "Olá." });
  assert.deepEqual(parsed.pares[1], { id: 2, original: "Goodbye.", traducao: "Tchau." });
});

test("parseCoherenceReviewResponse: tira cerca de markdown e valida a contagem", () => {
  const raw = "```json\n" + JSON.stringify({ reviews: [{ id: 1, nota: 92, explicacao: "" }, { id: 2, nota: 10, explicacao: "sentido invertido" }] }) + "\n```";
  const parsed = core.parseCoherenceReviewResponse(raw, 2);
  assert.deepEqual(parsed, [{ nota: 92, explicacao: "" }, { nota: 10, explicacao: "sentido invertido" }]);
});

test("parseCoherenceReviewResponse: nota fora da faixa 0-100 é grampeada, não rejeitada", () => {
  const raw = JSON.stringify({ reviews: [{ id: 1, nota: 150, explicacao: "" }, { id: 2, nota: -20, explicacao: "" }] });
  const parsed = core.parseCoherenceReviewResponse(raw, 2);
  assert.equal(parsed[0].nota, 100);
  assert.equal(parsed[1].nota, 0);
});

test("parseCoherenceReviewResponse: aceita array solto (sem a chave reviews) igual o parser de tradução", () => {
  const raw = JSON.stringify([{ id: 1, nota: 80, explicacao: "" }]);
  const parsed = core.parseCoherenceReviewResponse(raw, 1);
  assert.deepEqual(parsed, [{ nota: 80, explicacao: "" }]);
});

test("parseCoherenceReviewResponse: rejeita contagem errada (mesmo princípio do lote de tradução)", () => {
  const raw = JSON.stringify({ reviews: [{ id: 1, nota: 90, explicacao: "" }] });
  assert.throws(() => core.parseCoherenceReviewResponse(raw, 2), /esperava 2/);
});

test("parseCoherenceReviewResponse: JSON inválido dá erro claro", () => {
  assert.throws(() => core.parseCoherenceReviewResponse("isso não é json", 1), /não é um JSON válido/);
});

test("reviewTextHash: mesma tradução gera o mesmo hash, tradução diferente gera hash diferente", () => {
  const h1 = core.reviewTextHash("Olá, tudo bem?");
  const h2 = core.reviewTextHash("Olá, tudo bem?");
  const h3 = core.reviewTextHash("Olá, tudo bem?!");
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
});

test("runQualityCheck: injeta coherence-low quando há revisão salva com nota baixa", () => {
  const doc = {
    id: 1, fileName: "T.XLSX", project: "P", ignored: {}, qaIgnored: {},
    entries: [{ ref: "A1", original: "I am fine, thank you.", codes: [], lineCount: 1, lang: "en" }],
    translations: { A1: "Eu odeio você." },
    verified: {},
    coherenceReview: { A1: { nota: 8, explicacao: "sentido oposto ao original", textHash: core.reviewTextHash("Eu odeio você."), revisadoEm: Date.now() } },
  };
  const items = core.runQualityCheck([doc], []);
  const item = items.find((it) => it.ref === "A1");
  assert.ok(item, "deveria aparecer no QA");
  const coherenceIssue = item.issues.find((i) => i.type === "coherence-low");
  assert.ok(coherenceIssue, "deveria ter o issue de coerência baixa");
  assert.equal(coherenceIssue.severity, "critical");
  assert.match(coherenceIssue.detail, /8\/100/);
});

test("runQualityCheck: revisão com nota boa não aparece na lista de problemas", () => {
  const doc = {
    id: 1, fileName: "T.XLSX", project: "P", ignored: {}, qaIgnored: {},
    entries: [{ ref: "A1", original: "I am fine, thank you.", codes: [], lineCount: 1, lang: "pt" }],
    translations: { A1: "Estou bem, obrigado." },
    verified: {},
    coherenceReview: { A1: { nota: 95, explicacao: "", textHash: core.reviewTextHash("Estou bem, obrigado."), revisadoEm: Date.now() } },
  };
  const items = core.runQualityCheck([doc], []);
  assert.equal(items.length, 0);
});

test("runQualityCheck: doc sem coherenceReview nenhum continua funcionando (compatibilidade com progresso salvo antigo)", () => {
  const doc = {
    id: 1, fileName: "T.XLSX", project: "P", ignored: {}, qaIgnored: {},
    entries: [{ ref: "A1", original: "Hi.", codes: [], lineCount: 1, lang: "pt" }],
    translations: { A1: "Oi." },
    verified: {},
    // coherenceReview ausente de propósito — simula doc.json salvo antes desta funcionalidade existir
  };
  const items = core.runQualityCheck([doc], []);
  assert.equal(items.length, 0);
});
// ---------------------------------------------------------------------------
// Bug relatado pelo usuário: "Último erro: resposta do revisor não é um
// JSON válido" ao usar o revisor de coerência com Ollama local. Causa: o
// caminho do Ollama pedia o JSON só por instrução em texto (sem travar o
// formato pela própria API), diferente dos outros 3 provedores. Corrigido
// com ollamaReviewSchema + prefill próprio, selecionados via o parâmetro
// `kind` de buildOllamaNativeBody.
// ---------------------------------------------------------------------------

test("ollamaReviewSchema: formato correto (reviews, não translations) com minItems/maxItems", () => {
  const schema = core.ollamaReviewSchema(5);
  assert.equal(schema.required[0], "reviews");
  assert.equal(schema.properties.reviews.minItems, 5);
  assert.equal(schema.properties.reviews.maxItems, 5);
  assert.deepEqual(schema.properties.reviews.items.required, ["id", "nota", "explicacao"]);
});

test("buildOllamaNativeBody: kind='reviews' usa o schema e o prefill do revisor, não o de tradução", () => {
  const body = core.buildOllamaNativeBody({}, "sys", "user", 1000, true, 3, "reviews");
  assert.ok(body.format.properties.reviews, "deveria travar o formato em 'reviews'");
  assert.equal(body.format.properties.translations, undefined);
  const prefillMsg = body.messages[body.messages.length - 1];
  assert.equal(prefillMsg.role, "assistant");
  assert.equal(prefillMsg.content, '{"reviews": [');
});

test("buildOllamaNativeBody: sem kind (tradução) continua exatamente como antes — sem regressão", () => {
  const body = core.buildOllamaNativeBody({}, "sys", "user", 1000, true, 3);
  assert.ok(body.format.properties.translations, "deveria travar o formato em 'translations', igual sempre foi");
  assert.equal(body.format.properties.reviews, undefined);
  const prefillMsg = body.messages[body.messages.length - 1];
  assert.equal(prefillMsg.content, '{"translations": [');
});

test("buildOllamaNativeBody: kind='translations' explícito dá o mesmo resultado que omitir o parâmetro", () => {
  const a = core.buildOllamaNativeBody({}, "sys", "user", 1000, true, 4);
  const b = core.buildOllamaNativeBody({}, "sys", "user", 1000, true, 4, "translations");
  assert.deepEqual(a.format, b.format);
  assert.equal(a.messages[a.messages.length - 1].content, b.messages[b.messages.length - 1].content);
});
// ---------------------------------------------------------------------------
// Bug real reportado pelo usuário via diagnóstico
// (diagnostico-qa-CS3-20260805T053711Z.json): "Girl's Voice" -> "Voz da
// Garota" (tradução correta, já verificada por humano) recebeu nota de
// coerência 0/100 com explicação "Texto vazio" — veredito que claramente
// não é sobre ESTE par. Causa: parseCoherenceReviewResponse confiava só na
// POSIÇÃO do array de saída, ignorando o campo "id" que o próprio schema
// pede — um modelo que devolve os itens do lote fora de ordem (mas com
// "id" certo em cada um) fazia o veredito de um par cair no slot errado.
// ---------------------------------------------------------------------------

test("parseCoherenceReviewResponse: reordena pelo id quando o array vem fora de ordem", () => {
  // reconstitui o formato do bug: 2 pares, resposta do modelo veio com o
  // 2º par primeiro no array
  const raw = JSON.stringify({ reviews: [
    { id: 2, nota: 95, explicacao: "" },
    { id: 1, nota: 0, explicacao: "Texto vazio" },
  ] });
  const parsed = core.parseCoherenceReviewResponse(raw, 2);
  // posição 0 tem que ser o veredito do PAR 1 (id:1), não o que veio primeiro no array
  assert.deepEqual(parsed[0], { nota: 0, explicacao: "Texto vazio" });
  assert.deepEqual(parsed[1], { nota: 95, explicacao: "" });
});

test("parseCoherenceReviewResponse: caso real do relatório — 'Girl's Voice'/'Voz da Garota' não pode herdar nota de outro par", () => {
  // O par 1 é a tradução correta e devia sair com nota alta; o par 2 (não
  // mostrado no relatório, mas existente no mesmo lote) é o que
  // legitimamente estava vazio. Simula o array de saída na ordem errada,
  // como o modelo local devolveu.
  const raw = JSON.stringify({ reviews: [
    { id: 2, nota: 0, explicacao: "Texto vazio" },
    { id: 1, nota: 96, explicacao: "" },
  ] });
  const parsed = core.parseCoherenceReviewResponse(raw, 2);
  const notaDoParUm = parsed[0]; // "Girl's Voice" / "Voz da Garota"
  assert.equal(notaDoParUm.nota, 96, "a tradução correta não pode ficar com a nota do par vazio");
  assert.equal(core.coherenceIssueSeverity(notaDoParUm.nota), null, "nota 96 não devia virar issue nenhum");
});

test("parseCoherenceReviewResponse: sem id nenhum, mantém o comportamento posicional de sempre (compatibilidade)", () => {
  const raw = JSON.stringify({ reviews: [{ nota: 80, explicacao: "" }, { nota: 40, explicacao: "tom mudou" }] });
  const parsed = core.parseCoherenceReviewResponse(raw, 2);
  assert.deepEqual(parsed, [{ nota: 80, explicacao: "" }, { nota: 40, explicacao: "tom mudou" }]);
});

test("parseCoherenceReviewResponse: ids inválidos (repetidos ou fora da faixa) caem pro fallback posicional em vez de travar", () => {
  const repetidos = JSON.stringify({ reviews: [{ id: 1, nota: 80, explicacao: "" }, { id: 1, nota: 40, explicacao: "" }] });
  assert.deepEqual(core.parseCoherenceReviewResponse(repetidos, 2), [{ nota: 80, explicacao: "" }, { nota: 40, explicacao: "" }]);

  const foraDaFaixa = JSON.stringify({ reviews: [{ id: 0, nota: 80, explicacao: "" }, { id: 5, nota: 40, explicacao: "" }] });
  assert.deepEqual(core.parseCoherenceReviewResponse(foraDaFaixa, 2), [{ nota: 80, explicacao: "" }, { nota: 40, explicacao: "" }]);
});

test("parseCoherenceReviewResponse: ids corretos mas já na ordem certa não muda nada", () => {
  const raw = JSON.stringify({ reviews: [{ id: 1, nota: 70, explicacao: "" }, { id: 2, nota: 30, explicacao: "x" }] });
  assert.deepEqual(core.parseCoherenceReviewResponse(raw, 2), [{ nota: 70, explicacao: "" }, { nota: 30, explicacao: "x" }]);
});


// ---------------------------------------------------------------------------
// Editor de Cenas (Fase 2 do app Windows) -- testado contra um trecho REAL
// extraido de a0000.xlsx (arquivo de cena de verdade que o usuario mandou,
// decompilado com o SenScriptsDecompiler dele), nao um mock inventado. O
// trecho e a funcao TK_System_Debug_Monotone (linhas 20080-20099 do arquivo
// original), que ja cobre: FUNCTION nomeada, um branch com "pointer" real
// (formula "=A20104", nao um valor calculado), a estrutura aninhada
// Start/OP Code/End (valores sempre vazios), dialogo (tipo "dialog") e
// varios OP codes fora da lista documentada no PDF (7, 20, 132) -- que
// precisam funcionar igual aos documentados, so sem rotulo amigavel.
const REAL_SCENE_WS = {
  "A20078": {
    "v": "Location"
  },
  "B20078": {
    "v": "OP Code"
  },
  "A20079": {
    "v": 130694
  },
  "B20079": {
    "v": 1
  },
  "A20080": {
    "v": "FUNCTION"
  },
  "B20080": {
    "v": "TK_System_Debug_Monotone"
  },
  "A20081": {
    "v": "Location"
  },
  "B20081": {
    "v": "OP Code"
  },
  "C20081": {
    "v": "byte"
  },
  "D20081": {
    "v": "Start"
  },
  "E20081": {
    "v": "OP Code"
  },
  "F20081": {
    "v": "int"
  },
  "G20081": {
    "v": "End"
  },
  "H20081": {
    "v": "byte"
  },
  "I20081": {
    "v": "pointer"
  },
  "A20082": {
    "v": 130696
  },
  "B20082": {
    "v": 5
  },
  "C20082": {
    "v": 28
  },
  "D20082": {
    "v": ""
  },
  "E20082": {
    "v": 168
  },
  "F20082": {
    "v": -2147483648
  },
  "G20082": {
    "v": ""
  },
  "H20082": {
    "v": 1
  },
  "I20082": {
    "f": "A20104"
  },
  "A20083": {
    "v": "Location"
  },
  "B20083": {
    "v": "OP Code"
  },
  "C20083": {
    "v": "byte"
  },
  "D20083": {
    "v": "byte"
  },
  "E20083": {
    "v": "string"
  },
  "A20084": {
    "v": 130708
  },
  "B20084": {
    "v": 7
  },
  "C20084": {
    "v": 2
  },
  "D20084": {
    "v": 221
  },
  "E20084": {
    "v": "monotone: off"
  },
  "A20085": {
    "v": "Location"
  },
  "B20085": {
    "v": "OP Code"
  },
  "C20085": {
    "v": "byte"
  },
  "D20085": {
    "v": "float"
  },
  "E20085": {
    "v": "float"
  },
  "F20085": {
    "v": "float"
  },
  "G20085": {
    "v": "float"
  },
  "A20086": {
    "v": 130725
  },
  "B20086": {
    "v": 132
  },
  "C20086": {
    "v": 0
  },
  "D20086": {
    "v": 0.5
  },
  "E20086": {
    "v": 0.5
  },
  "F20086": {
    "v": 0.5
  },
  "G20086": {
    "v": 0
  },
  "A20087": {
    "v": "Location"
  },
  "B20087": {
    "v": "OP Code"
  },
  "C20087": {
    "v": "int"
  },
  "A20088": {
    "v": 130743
  },
  "B20088": {
    "v": 20
  },
  "C20088": {
    "v": -2147483648
  },
  "A20089": {
    "v": "Location"
  },
  "B20089": {
    "v": "OP Code"
  },
  "C20089": {
    "v": "byte"
  },
  "D20089": {
    "v": "short"
  },
  "E20089": {
    "v": "string"
  },
  "F20089": {
    "v": "byte"
  },
  "A20090": {
    "v": 130748
  },
  "B20090": {
    "v": 132
  },
  "C20090": {
    "v": 3
  },
  "D20090": {
    "v": 61440
  },
  "E20090": {
    "v": ""
  },
  "F20090": {
    "v": 1
  },
  "A20091": {
    "v": "Location"
  },
  "B20091": {
    "v": "OP Code"
  },
  "C20091": {
    "v": "byte"
  },
  "D20091": {
    "v": "short"
  },
  "E20091": {
    "v": "string"
  },
  "F20091": {
    "v": "byte"
  },
  "A20092": {
    "v": 130754
  },
  "B20092": {
    "v": 132
  },
  "C20092": {
    "v": 3
  },
  "D20092": {
    "v": 61441
  },
  "E20092": {
    "v": ""
  },
  "F20092": {
    "v": 1
  },
  "A20093": {
    "v": "Location"
  },
  "B20093": {
    "v": "OP Code"
  },
  "C20093": {
    "v": "byte"
  },
  "D20093": {
    "v": "short"
  },
  "E20093": {
    "v": "string"
  },
  "F20093": {
    "v": "byte"
  },
  "A20094": {
    "v": 130760
  },
  "B20094": {
    "v": 132
  },
  "C20094": {
    "v": 3
  },
  "D20094": {
    "v": 61442
  },
  "E20094": {
    "v": ""
  },
  "F20094": {
    "v": 1
  },
  "A20095": {
    "v": "Location"
  },
  "B20095": {
    "v": "OP Code"
  },
  "C20095": {
    "v": "byte"
  },
  "D20095": {
    "v": "short"
  },
  "E20095": {
    "v": "string"
  },
  "A20096": {
    "v": 130766
  },
  "B20096": {
    "v": 60
  },
  "C20096": {
    "v": 4
  },
  "D20096": {
    "v": 61457
  },
  "E20096": {
    "v": "#E_0#M_0"
  },
  "A20097": {
    "v": "Location"
  },
  "B20097": {
    "v": "OP Code"
  },
  "C20097": {
    "v": "short"
  },
  "D20097": {
    "v": "int"
  },
  "E20097": {
    "v": "dialog"
  },
  "F20097": {
    "v": "byte"
  },
  "G20097": {
    "v": "byte"
  },
  "A20098": {
    "v": 130779
  },
  "B20098": {
    "v": 36
  },
  "C20098": {
    "v": 61457
  },
  "D20098": {
    "v": 0
  },
  "E20098": {
    "v": "#KThe color face."
  },
  "F20098": {
    "v": 2
  },
  "G20098": {
    "v": 0
  },
  "A20099": {
    "v": "Location"
  },
  "B20099": {
    "v": "OP Code"
  }
};

test("parseSceneSheet: reconhece o bloco FUNCTION e agrupa as instrucoes dele", () => {
  const result = core.parseSceneSheet(REAL_SCENE_WS, fakeXLSX);
  assert.equal(result.functions.length, 1);
  assert.equal(result.functions[0].name, "TK_System_Debug_Monotone");
  assert.equal(result.functions[0].row, 20080);
  assert.equal(result.functions[0].instructions.length, 9);
});

test("parseSceneSheet: instrucao com 'pointer' guarda a formula (=A20104), nao um valor calculado", () => {
  const result = core.parseSceneSheet(REAL_SCENE_WS, fakeXLSX);
  const branch = result.functions[0].instructions[0];
  assert.equal(branch.opCode, 5);
  assert.equal(branch.label, "Condição (branch)");
  const pointerParam = branch.params.find((p) => p.type === "pointer");
  assert.equal(pointerParam.value, "=A20104");
  assert.deepEqual(core.parseScenePointerTarget(pointerParam.value), { col: "A", row: 20104 });
});

test("parseSceneSheet: Start/OP Code aninhado/End entram como parametros nao-editaveis, valor vazio preservado", () => {
  const result = core.parseSceneSheet(REAL_SCENE_WS, fakeXLSX);
  const branch = result.functions[0].instructions[0];
  const start = branch.params.find((p) => p.type === "Start");
  const nestedOp = branch.params.find((p) => p.type === "OP Code");
  const end = branch.params.find((p) => p.type === "End");
  assert.equal(start.value, "");
  assert.equal(nestedOp.value, 168);
  assert.equal(end.value, "");
  assert.equal(core.isEditableSceneParamType("Start"), false);
  assert.equal(core.isEditableSceneParamType("OP Code"), false);
  assert.equal(core.isEditableSceneParamType("End"), false);
});

test("parseSceneSheet: dialogo (OP 36) e string comum ficam editaveis, com o rotulo amigavel certo", () => {
  const result = core.parseSceneSheet(REAL_SCENE_WS, fakeXLSX);
  const instructions = result.functions[0].instructions;
  const dialog = instructions.find((i) => i.opCode === 36);
  assert.equal(dialog.label, "Diálogo — texto");
  const dialogParam = dialog.params.find((p) => p.type === "dialog");
  assert.equal(dialogParam.value, "#KThe color face.");
  assert.equal(core.isEditableSceneParamType("dialog"), true);

  const monotoneOff = instructions.find((i) => i.opCode === 7);
  assert.equal(monotoneOff.label, null, "OP 7 nao esta na lista documentada -- sem rotulo, mas funciona igual");
  const strParam = monotoneOff.params.find((p) => p.type === "string");
  assert.equal(strParam.value, "monotone: off");
});

test("validateSceneEdit: aceita editar campo tipado (string/byte/dialog/...), recusa fill/pointer/Start/End", () => {
  const result = core.parseSceneSheet(REAL_SCENE_WS, fakeXLSX);
  const branch = result.functions[0].instructions[0]; // OP 5, tem pointer/Start/End
  const monotoneOff = result.functions[0].instructions[1]; // OP 7, so campos editaveis

  const pointerCol = branch.params.find((p) => p.type === "pointer").col;
  assert.equal(core.validateSceneEdit(branch, pointerCol).ok, false);

  const stringCol = monotoneOff.params.find((p) => p.type === "string").col;
  assert.equal(core.validateSceneEdit(monotoneOff, stringCol).ok, true);

  assert.equal(core.validateSceneEdit(monotoneOff, 999).ok, false, "coluna que nao existe na instrucao tambem recusa");
});

test("applySceneEditsToWorksheet: edita so a celula pedida, nao muda a planilha original, preserva pointer/fill intactos", () => {
  const edited = core.applySceneEditsToWorksheet(REAL_SCENE_WS, fakeXLSX, [
    { row: 20084, col: 5, value: "monotone: ON (traduzido)" },
  ]);
  assert.equal(edited["E20084"].v, "monotone: ON (traduzido)");
  assert.equal(edited["E20084"].t, "s");
  // original nao foi mutado (funcao pura)
  assert.equal(REAL_SCENE_WS["E20084"].v, "monotone: off");
  // toda outra celula do resultado e identica a original, inclusive a formula do pointer
  const changedKeys = Object.keys(edited).filter(
    (k) => JSON.stringify(edited[k]) !== JSON.stringify(REAL_SCENE_WS[k])
  );
  assert.deepEqual(changedKeys, ["E20084"]);
  assert.equal(edited["I20082"].f, "A20104", "celula pointer continua com a formula original, intocada");
});

test("applySceneEditsToWorksheet: valor numerico grava t:'n', valor string grava t:'s'", () => {
  const edited = core.applySceneEditsToWorksheet(REAL_SCENE_WS, fakeXLSX, [
    { row: 20086, col: 3, value: 5 }, // era byte=0
  ]);
  assert.equal(edited["C20086"].v, 5);
  assert.equal(edited["C20086"].t, "n");
});

// ---------------------------------------------------------------------------
// OP 41 (opcao de menu / ARCUS) e multi-variante: o mesmo OP code aparece
// com formatos de parametro TOTALMENTE diferentes dependendo do primeiro
// byte -- confirmado com 3 formatos reais distintos em a0000.xlsx (linhas
// 10120, 10133, 10152). O parser nao pode assumir um formato fixo por OP
// code: tem que ler o tipo de cada instrucao a partir do PROPRIO cabecalho
// dela, nunca de uma tabela hardcoded.
// ---------------------------------------------------------------------------
test("parseSceneSheet: OP 41 com formatos diferentes na mesma planilha nao quebra (le cada um pelo proprio cabecalho)", () => {
  const ws = {
    A1: { v: "FUNCTION" }, B1: { v: "TK_Event_Jump_Test" },
    A2: { v: "Location" }, B2: { v: "OP Code" }, C2: { v: "byte" }, D2: { v: "byte" }, E2: { v: "short" }, F2: { v: "float" }, G2: { v: "float" },
    A3: { v: 10120 }, B3: { v: 41 }, C3: { v: 0 }, D3: { v: 1 }, E3: { v: 0 }, F3: { v: 40 }, G3: { v: 0 },
    A4: { v: "Location" }, B4: { v: "OP Code" }, C4: { v: "byte" }, D4: { v: "byte" }, E4: { v: "string" }, F4: { v: "int" },
    A5: { v: 10133 }, B5: { v: 41 }, C5: { v: 1 }, D5: { v: 1 }, E5: { v: "Claire Test" }, F5: { v: 2 },
  };
  const result = core.parseSceneSheet(ws, fakeXLSX);
  const [i1, i2] = result.functions[0].instructions;
  assert.equal(i1.params.length, 5);
  assert.equal(i2.params.length, 4);
  assert.equal(i2.params.find((p) => p.type === "string").value, "Claire Test");
  assert.equal(i1.label, "Opção de menu / ARCUS (variantes por sub-tipo)");
  assert.equal(i2.label, "Opção de menu / ARCUS (variantes por sub-tipo)");
});

test("parseSceneSheet: instrucao sem nenhum parametro extra (so Location/OP Code) nao quebra", () => {
  const ws = {
    A1: { v: "FUNCTION" }, B1: { v: "" },
    A2: { v: "Location" }, B2: { v: "OP Code" },
    A3: { v: 3748 }, B3: { v: 1 },
  };
  const result = core.parseSceneSheet(ws, fakeXLSX);
  assert.equal(result.functions[0].instructions.length, 1);
  assert.deepEqual(result.functions[0].instructions[0].params, []);
});

test("sceneOpLabel: retorna null pra OP code fora da lista documentada, em vez de inventar rotulo", () => {
  assert.equal(core.sceneOpLabel(90), null);
  assert.equal(core.sceneOpLabel(172), "Encadear evento");
});

// ---------------------------------------------------------------------------
// Fase 3 — Assistente de ID de arquivo novo.
//
// Formula verificada a mao contra o exemplo do PDF "Documentation for
// script files editing in CS3" (autor Twn), pagina do calculo de ID:
// "m0292" -> 0x000625E8. Conferencia: base('m') = 0x61A80 = 400000;
// 292 * 10 = 2920; 400000 + 2920 = 402920 = 0x625E8. Bate exatamente.
// ---------------------------------------------------------------------------
test("computeScriptFileId: exemplo real do PDF (m0292 -> 0x000625E8)", () => {
  const r = core.computeScriptFileId("m0292");
  assert.equal(r.letter, "m");
  assert.equal(r.suffix, 292);
  assert.equal(r.id, 402920);
  assert.equal(r.hex, "0x000625E8");
});

test("computeScriptFileId: ignora extensao (.dat/.xlsx) e espacos", () => {
  assert.equal(core.computeScriptFileId("m0292.dat").hex, "0x000625E8");
  assert.equal(core.computeScriptFileId("m0292.xlsx").hex, "0x000625E8");
  assert.equal(core.computeScriptFileId("  m0292  ").hex, "0x000625E8");
});

test("computeScriptFileId: a0000 (arquivo real que o usuario mandou) da ID zero", () => {
  const r = core.computeScriptFileId("a0000.xlsx");
  assert.equal(r.letter, "a");
  assert.equal(r.suffix, 0);
  assert.equal(r.id, 0);
  assert.equal(r.hex, "0x00000000");
});

test("computeScriptFileId: cobre todos os 9 prefixos documentados no PDF", () => {
  assert.equal(core.computeScriptFileId("a0001").id, 0 + 10);
  assert.equal(core.computeScriptFileId("c0001").id, 0x186a0 + 10);
  assert.equal(core.computeScriptFileId("t0001").id, 0x30d40 + 10);
  assert.equal(core.computeScriptFileId("r0001").id, 0x493e0 + 10);
  assert.equal(core.computeScriptFileId("m0001").id, 0x61a80 + 10);
  assert.equal(core.computeScriptFileId("e0001").id, 0x7a120 + 10);
  assert.equal(core.computeScriptFileId("f0001").id, 0x927c0 + 10);
  assert.equal(core.computeScriptFileId("v0001").id, 0xaae60 + 10);
  assert.equal(core.computeScriptFileId("i0001").id, 0x13d620 + 10);
});

test("computeScriptFileId: prefixo fora da tabela ou sem numero retorna null (nao inventa ID)", () => {
  assert.equal(core.computeScriptFileId("b0001"), null);
  assert.equal(core.computeScriptFileId("system"), null);
  assert.equal(core.computeScriptFileId(""), null);
  assert.equal(core.computeScriptFileId(null), null);
});

// ---------------------------------------------------------------------------
// Fase 3 — Editor de OPS (data/ops/pc/*.ops, XML). Fixture abaixo e uma
// transcricao literal do exemplo real citado no PDF de documentacao
// (bloco <Entrys> com go_m0280 / RANDY1 / AV_D_ED) — nao e um arquivo que
// o usuario enviou diretamente, entao vale so como validacao de FORMATO
// (nomes/valores de atributo), nao como garantia de round-trip contra um
// .ops real. Estrategia de edicao e sempre cirurgica: nunca reconstroi a
// linha inteira, so troca o valor entre aspas do atributo pedido.
// ---------------------------------------------------------------------------
const REAL_OPS_XML_FIXTURE = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  "<!-- entrada -->",
  "<Entrys>",
  '\t<EntryBox name="go_m0280" next="m0280" entry="go_m0291" placeId="0" flag="0x1" pos="0, -4, 86, 0, 3.141593, 0, 12, 12, 2" distance="4" cameraDir="-1" entryType="0" markPos="0, 0" type="EB_EVENT"/>',
  '\t<EntryBox name="RANDY1" next="" entry="" placeId="0" flag="0x1" pos="0, 0, 16.5, 0, 0, 0, 10, 10, 2" distance="2" cameraDir="-1" entryType="0" markPos="0, 0" type="EB_EVENT"/>',
  '\t<EntryBox name="AV_D_ED" next="" entry="" placeId="0" flag="0x1" pos="0, 1.182, 67.738, 0, 3.141593, 0, 12, 12, 2" distance="4" cameraDir="-1" entryType="0" markPos="0, 0" type="EB_EVENT"/>',
  "</Entrys>",
].join("\n");

test("findOpsEntryBoxes: acha as 3 EntryBox e le os atributos certos", () => {
  const { boxes } = core.findOpsEntryBoxes(REAL_OPS_XML_FIXTURE);
  assert.equal(boxes.length, 3);
  assert.equal(core.opsEntryAttr(boxes[0], "name"), "go_m0280");
  assert.equal(core.opsEntryAttr(boxes[0], "next"), "m0280");
  assert.equal(core.opsEntryAttr(boxes[1], "name"), "RANDY1");
  assert.equal(core.opsEntryAttr(boxes[1], "pos"), "0, 0, 16.5, 0, 0, 0, 10, 10, 2");
  assert.equal(core.opsEntryAttr(boxes[2], "name"), "AV_D_ED");
  assert.equal(core.opsEntryAttr(boxes[2], "distance"), "4");
  assert.equal(core.opsEntryAttr(boxes[0], "atributo-que-nao-existe"), null);
});

test("findOpsEntryBoxes: detecta quebra de linha \\r\\n quando presente", () => {
  const crlf = REAL_OPS_XML_FIXTURE.replace(/\n/g, "\r\n");
  const { lineEnding } = core.findOpsEntryBoxes(crlf);
  assert.equal(lineEnding, "\r\n");
  const { lineEnding: lf } = core.findOpsEntryBoxes(REAL_OPS_XML_FIXTURE);
  assert.equal(lf, "\n");
});

test("applyOpsAttrEdits: troca so o valor pedido, preserva todo o resto do arquivo byte a byte", () => {
  const { lines, boxes, lineEnding } = core.findOpsEntryBoxes(REAL_OPS_XML_FIXTURE);
  const edited = core.applyOpsAttrEdits(lines, boxes, [
    { lineIndex: boxes[1].lineIndex, name: "pos", value: "1, 2, 3, 0, 0, 0, 10, 10, 2" },
  ]);
  const outText = core.opsTextFromLines(edited, lineEnding);

  // a linha editada mudou so o pos, o resto dos atributos dela ficou igual
  const { boxes: reparsed } = core.findOpsEntryBoxes(outText);
  assert.equal(core.opsEntryAttr(reparsed[1], "pos"), "1, 2, 3, 0, 0, 0, 10, 10, 2");
  assert.equal(core.opsEntryAttr(reparsed[1], "name"), "RANDY1");
  assert.equal(core.opsEntryAttr(reparsed[1], "distance"), "2");

  // as outras linhas (incluindo cabecalho XML e comentario) ficaram
  // exatamente iguais, char por char
  assert.equal(edited[0], lines[0]);
  assert.equal(edited[1], lines[1]);
  assert.equal(edited[2], lines[2]);
  assert.equal(edited[3], lines[3]); // go_m0280 nao foi tocada
  assert.equal(edited[5], lines[5]); // AV_D_ED nao foi tocada
  assert.equal(edited[6], lines[6]); // </Entrys>
});

test("applyOpsAttrEdits: varias edicoes na mesma linha nao se atropelam (posicoes shiftam)", () => {
  const { lines, boxes, lineEnding } = core.findOpsEntryBoxes(REAL_OPS_XML_FIXTURE);
  const edited = core.applyOpsAttrEdits(lines, boxes, [
    { lineIndex: boxes[0].lineIndex, name: "name", value: "go_m0280_v2" },
    { lineIndex: boxes[0].lineIndex, name: "next", value: "m0280b" },
    { lineIndex: boxes[0].lineIndex, name: "type", value: "EB_EVENT2" },
  ]);
  const outText = core.opsTextFromLines(edited, lineEnding);
  const { boxes: reparsed } = core.findOpsEntryBoxes(outText);
  assert.equal(core.opsEntryAttr(reparsed[0], "name"), "go_m0280_v2");
  assert.equal(core.opsEntryAttr(reparsed[0], "next"), "m0280b");
  assert.equal(core.opsEntryAttr(reparsed[0], "type"), "EB_EVENT2");
  // atributos entre os editados continuam intactos
  assert.equal(core.opsEntryAttr(reparsed[0], "entry"), "go_m0291");
  assert.equal(core.opsEntryAttr(reparsed[0], "placeId"), "0");
});

test("applyOpsAttrEdits: pedir um atributo que nao existe na linha e ignorado, nao quebra", () => {
  const { lines, boxes } = core.findOpsEntryBoxes(REAL_OPS_XML_FIXTURE);
  const edited = core.applyOpsAttrEdits(lines, boxes, [
    { lineIndex: boxes[0].lineIndex, name: "atributo-fantasma", value: "x" },
  ]);
  assert.equal(edited[boxes[0].lineIndex], lines[boxes[0].lineIndex]);
});

test("cloneOpsEntryBoxLine + insertOpsLine: duplicar uma entrada (tecnica citada no PDF) preserva atributos nao mencionados", () => {
  const { lines, boxes } = core.findOpsEntryBoxes(REAL_OPS_XML_FIXTURE);
  const box = boxes[1]; // RANDY1
  const clone = core.cloneOpsEntryBoxLine(box, lines[box.lineIndex], {
    name: "RANDY2",
    pos: "9, 9, 9, 0, 0, 0, 10, 10, 2",
  });
  const withNew = core.insertOpsLine(lines, box.lineIndex, clone);
  assert.equal(withNew.length, lines.length + 1);

  const outText = withNew.join("\n");
  const { boxes: reparsed } = core.findOpsEntryBoxes(outText);
  assert.equal(reparsed.length, 4);
  const cloneParsed = reparsed[2]; // logo apos RANDY1 original
  assert.equal(core.opsEntryAttr(cloneParsed, "name"), "RANDY2");
  assert.equal(core.opsEntryAttr(cloneParsed, "pos"), "9, 9, 9, 0, 0, 0, 10, 10, 2");
  // atributos NAO mencionados no override vieram intactos do original
  assert.equal(core.opsEntryAttr(cloneParsed, "distance"), "2");
  assert.equal(core.opsEntryAttr(cloneParsed, "type"), "EB_EVENT");
  // a entrada original (RANDY1) continua existindo, sem alteracao
  assert.equal(core.opsEntryAttr(reparsed[1], "name"), "RANDY1");
});

test("opsTextFromLines: junta com o line ending certo (LF por padrao, CRLF quando detectado)", () => {
  const { lines } = core.findOpsEntryBoxes(REAL_OPS_XML_FIXTURE);
  assert.equal(core.opsTextFromLines(lines, "\n"), REAL_OPS_XML_FIXTURE);
  assert.equal(core.opsTextFromLines(lines, "\r\n"), REAL_OPS_XML_FIXTURE.replace(/\n/g, "\r\n"));
});

// ---------------------------------------------------------------------------
// Fase 3 — Editor de tabela de itens (t_item_en.tbl). Fixture abaixo e um
// RECORTE REAL (bytes 0x00-0x33F) do t_item_en.tbl que o usuario enviou —
// cabecalho do arquivo + os 2 primeiros registros completos ("Tear Balm" e
// "Teara Balm") + comeco do 3o. Validado contra o arquivo INTEIRO (311891
// bytes, 937 registros declarados no cabecalho) rodando parseItemTable em
// Node antes de escrever esses testes: 834 registros reconhecidos, ZERO
// "unrecognized" (nenhum candidato que bateu o padrao de flag falhou a
// validacao de texto), 0 duplicatas suspeitas alem do esperado, e um
// round-trip completo (editar nome+descricao com acentos e depois desfazer)
// reproduziu o arquivo original BYTE A BYTE (Buffer.compare === 0).
// ---------------------------------------------------------------------------
const REAL_TBL_ITEM_FIXTURE_HEX =
  "dc04020000006974656d00a90300006974656d5f7100330100006974656d0020010000ffff534c4342504d5a00810300000000000000000a0000803f01000000000000c8420000c8c2640058020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c8000000630100ffff546561722042616c6d005b205265636f76657279202d20233131434f6e65233043202d2023313143526573746f72657320363030204850233043205d0a2041206865616c696e672073616c766520707265706172656420627920746865205365707469616e204368757263682e20526573746f726573206120736d616c6c20616d6f756e74206f662048502e0000000000000000006974656d0023010100ffff534c4342504d5a00810300000000000000000a0000803f01000000000000c8420000c8c264000807000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020030000630200ffff54656172612042616c6d005b205265636f76657279202d20233131434f6e65233043202d2023313143526573746f7265732031383030204850233043205d0a2041206865616c696e672073616c766520707265706172656420627920746865205365707469616e204368757263682e20526573746f7265732061206d656469756d20616d6f756e74206f662048502e0000000000000000006974656d0023010200ffff534c4342504d5a00810300000000000000000a0000803f01000000000000c8420000c8c2640018150000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000800c0000630300ffff54656172616c2042616c6d005b205265636f76657279202d20233131434f6e65233043202d2023313143526573746f7265732035343030204850233043205d0a204120";

function realTblFixtureBytes() {
  const buf = Buffer.from(REAL_TBL_ITEM_FIXTURE_HEX, "hex");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
}

test("parseItemTable: reconhece os 2 registros reais completos do recorte (Tear Balm / Teara Balm)", () => {
  const result = core.parseItemTable(realTblFixtureBytes());
  assert.equal(result.records.length, 2); // o 3o registro do recorte esta truncado de proposito
  // o 3o registro ("Tearal Balm") bate o padrao da flag mas fica com o
  // nome/descricao cortados pelo fim do recorte -- contabiliza como
  // "unrecognized" (nao vira registro editavel), do jeito certo: no
  // arquivo INTEIRO (nao truncado) esse mesmo registro passa limpo, so
  // aqui no recorte de teste que ele fica incompleto de proposito.
  assert.equal(result.unrecognized, 1);
  assert.equal(result.records[0].flag, "SLCBPMZ");
  assert.equal(result.records[0].name, "Tear Balm");
  assert.equal(
    result.records[0].desc,
    "[ Recovery - #11COne#0C - #11CRestores 600 HP#0C ]\n A healing salve prepared by the Septian Church. Restores a small amount of HP."
  );
  assert.equal(result.records[1].name, "Teara Balm");
  assert.match(result.records[1].desc, /Restores 1800 HP/);
});

test("parseItemTable: nao inventa registro nenhum num arquivo vazio ou minusculo", () => {
  assert.deepEqual(core.parseItemTable(new Uint8Array(0)), { records: [], unrecognized: 0, totalBytes: 0 });
  assert.equal(core.parseItemTable(new Uint8Array([0xff, 0xff, 0x41, 0x00])).records.length, 0);
});

test("applyItemTableFieldEdit: troca o nome preservando TUDO mais byte a byte (round-trip exato)", () => {
  const original = realTblFixtureBytes();
  const parsed1 = core.parseItemTable(original);
  const rec = parsed1.records[0];

  const edited = core.applyItemTableFieldEdit(original, rec.nameStart, rec.nameEnd, "Bálsamo Lacrimal");
  const parsed2 = core.parseItemTable(edited);
  assert.equal(parsed2.records.length, 2);
  assert.equal(parsed2.records[0].name, "Bálsamo Lacrimal");
  // registro seguinte, nao editado, continua identico
  assert.equal(parsed2.records[1].name, "Teara Balm");
  assert.equal(parsed2.records[1].desc, parsed1.records[1].desc);
  // descricao do registro editado tambem nao mudou (so o nome foi trocado)
  assert.equal(parsed2.records[0].desc, parsed1.records[0].desc);

  // desfaz a edicao escrevendo o nome original de volta -- tem que voltar
  // byte a byte identico ao arquivo original (nenhum outro byte se perdeu)
  const undone = core.applyItemTableFieldEdit(edited, parsed2.records[0].nameStart, parsed2.records[0].nameEnd, "Tear Balm");
  assert.equal(Buffer.compare(Buffer.from(undone), Buffer.from(original)), 0);
});

test("applyItemTableFieldEdit: edita a descricao (com acento e quebra de linha embutida) sem quebrar o registro seguinte", () => {
  const original = realTblFixtureBytes();
  const parsed1 = core.parseItemTable(original);
  const rec = parsed1.records[0];
  const novaDesc = "[ Recuperação - #11CUm#0C - #11CRestaura 600 PV#0C ]\n Um bálsamo curativo preparado pela Igreja Septiana.";

  const edited = core.applyItemTableFieldEdit(original, rec.descStart, rec.descEnd, novaDesc);
  const parsed2 = core.parseItemTable(edited);
  assert.equal(parsed2.records.length, 2);
  assert.equal(parsed2.records[0].name, "Tear Balm"); // nome nao mudou
  assert.equal(parsed2.records[0].desc, novaDesc);
  assert.equal(parsed2.records[1].name, "Teara Balm"); // registro seguinte intacto
});

test("tblIsCleanText: aceita \\n embutido, rejeita outros caracteres de controle e strings vazias/gigantes", () => {
  assert.equal(core.tblIsCleanText("linha 1\nlinha 2", 100), true);
  assert.equal(core.tblIsCleanText("", 100), false);
  assert.equal(core.tblIsCleanText("a".repeat(100), 100), false); // >= maxLen
  assert.equal(core.tblIsCleanText("com \x01 controle", 100), false);
  assert.equal(core.tblIsCleanText("com \x00 nul", 100), false);
});

// ---------------------------------------------------------------------------
// Fase 3 — Editor de tabelas "com tag" (t_place.tbl / t_name.tbl). Fixtures
// abaixo são RECORTES REAIS (cabeçalho + 3 primeiros registros completos)
// dos dois arquivos que o usuário enviou. Validado contra os arquivos
// INTEIROS em Node antes de escrever estes testes:
//   - t_place.tbl (30026 bytes): 474 de 474 registros reconhecidos (100%,
//     zero exceção) — o título/nome do lugar é sempre o 4º campo contando
//     do fim, mesmo com o total de campos variando (10/11/12).
//   - t_name.tbl (150070 bytes): 1581 de 1581 registros reconhecidos
//     (100%, zero exceção) — sempre exatamente 6 campos, nome de exibição
//     é o 1º.
//   Round-trip completo (editar com acentos portugueses + desfazer) nos
//   dois arquivos inteiros reproduziu o original BYTE A BYTE, incluindo o
//   lenField recalculado corretamente — validado em Node antes de expor
//   isso na UI, mesma barra da Fase 2/item table.
// ---------------------------------------------------------------------------
const REAL_TBL_PLACE_FIXTURE_HEX =
  "da0101000000506c6163655461626c654461746100da010000506c6163655461626c6544617461001800000000006e756c6c00000000006e002d2d006e006e006e00506c6163655461626c6544617461001900010000006e756c6c00000000006e003f3f3f006e006e006e00506c6163655461626c65446174610032000a0000006e756c6c00000000006e0050726f6c6f677565202d20537072696e67204f6e636520416761696e006e006e006e00";

const REAL_TBL_NAME_FIXTURE_HEX =
  "2d06010000004e616d655461626c6544617461002d0600004e616d655461626c654461746100460000005265616e00435f4348523030300063687230303000435f4348523030305f4643310046435f434852303030007265616e000000000000000000000000000000000005001a4e616d655461626c6544617461005400ffff5265616e3a205377696d7375697400435f4348523030305f4330310063687230303000435f4348523030305f4643310046435f434852303030007265616e000000000000000000000000000000000005ff214e616d655461626c6544617461005900ffff5265616e3a2053686f727420536c656576657300435f4348523030305f4330300063687230303000435f4348523030305f4643310046435f434852303030007265616e000000000000000000000000000000000005ff21";

function fixtureBytes(hex) {
  const buf = Buffer.from(hex, "hex");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
}

test("parsePlaceTable: reconhece os 3 lugares reais do recorte, titulo sempre o 4o campo do fim", () => {
  const result = core.parsePlaceTable(fixtureBytes(REAL_TBL_PLACE_FIXTURE_HEX));
  assert.equal(result.records.length, 3);
  assert.equal(result.unrecognized, 0);
  assert.equal(result.records[0].text, "--");
  assert.equal(result.records[1].text, "???");
  assert.equal(result.records[2].text, "Prologue - Spring Once Again");
});

test("parseNameTable: reconhece os 3 nomes reais do recorte (Rean / Rean: Swimsuit / Rean: Short Sleeves)", () => {
  const result = core.parseNameTable(fixtureBytes(REAL_TBL_NAME_FIXTURE_HEX));
  assert.equal(result.records.length, 3);
  assert.equal(result.unrecognized, 0);
  assert.equal(result.records[0].text, "Rean");
  assert.equal(result.records[0].idField, 0);
  assert.equal(result.records[1].text, "Rean: Swimsuit");
  assert.equal(result.records[1].idField, 0xffff);
  assert.equal(result.records[2].text, "Rean: Short Sleeves");
});

test("applyTaggedTableFieldEdit (place): edita o titulo, corrige o lenField e preserva os outros registros byte a byte, round-trip exato", () => {
  const original = fixtureBytes(REAL_TBL_PLACE_FIXTURE_HEX);
  const parsed1 = core.parsePlaceTable(original);
  const rec = parsed1.records[2]; // "Prologue - Spring Once Again"

  const novoTexto = "Prólogo - Primavera Outra Vez";
  const edited = core.applyTaggedTableFieldEdit(original, rec.start, rec.end, rec.tagFullLen, { start: rec.fieldStart, end: rec.fieldEnd }, novoTexto);
  const parsed2 = core.parsePlaceTable(edited);
  assert.equal(parsed2.records.length, 3);
  assert.equal(parsed2.records[2].text, novoTexto);
  // registros anteriores, nao editados, continuam identicos
  assert.equal(parsed2.records[0].text, "--");
  assert.equal(parsed2.records[1].text, "???");

  // desfaz a edicao -- tem que voltar byte a byte identico ao original,
  // incluindo o lenField (prova que a correcao do tamanho foi certa nas
  // DUAS direcoes, nao so "parseia de novo sem erro")
  const rec2 = parsed2.records[2];
  const undone = core.applyTaggedTableFieldEdit(edited, rec2.start, rec2.end, rec2.tagFullLen, { start: rec2.fieldStart, end: rec2.fieldEnd }, rec.text);
  assert.equal(Buffer.compare(Buffer.from(undone), Buffer.from(original)), 0);
});

test("applyTaggedTableFieldEdit (name): edita o nome de exibicao, corrige o lenField, round-trip exato", () => {
  const original = fixtureBytes(REAL_TBL_NAME_FIXTURE_HEX);
  const parsed1 = core.parseNameTable(original);
  const rec = parsed1.records[1]; // "Rean: Swimsuit"

  const novoTexto = "Rean: Traje de Banho";
  const edited = core.applyTaggedTableFieldEdit(original, rec.start, rec.end, rec.tagFullLen, { start: rec.fieldStart, end: rec.fieldEnd }, novoTexto);
  const parsed2 = core.parseNameTable(edited);
  assert.equal(parsed2.records.length, 3);
  assert.equal(parsed2.records[1].text, novoTexto);
  assert.equal(parsed2.records[0].text, "Rean");
  assert.equal(parsed2.records[2].text, "Rean: Short Sleeves");

  const rec2 = parsed2.records[1];
  const undone = core.applyTaggedTableFieldEdit(edited, rec2.start, rec2.end, rec2.tagFullLen, { start: rec2.fieldStart, end: rec2.fieldEnd }, rec.text);
  assert.equal(Buffer.compare(Buffer.from(undone), Buffer.from(original)), 0);
});

test("tblFindTagPositions: acha a tag certa e ignora tags parecidas de outra tabela", () => {
  const { positions, tagFullLen } = core.tblFindTagPositions(fixtureBytes(REAL_TBL_PLACE_FIXTURE_HEX), "PlaceTableData");
  assert.equal(positions.length, 4); // 1 preambulo + 3 registros
  assert.equal(tagFullLen, "PlaceTableData".length + 1);
  const { positions: none } = core.tblFindTagPositions(fixtureBytes(REAL_TBL_PLACE_FIXTURE_HEX), "NameTableData");
  assert.equal(none.length, 0);
});

// ---------------------------------------------------------------------------
// Motor genérico de tabela com tag (TBL_TABLE_PROFILES / parseTaggedTableByProfile
// / detectTblProfile) — 7 tabelas novas descobertas escaneando Text.zip (54
// arquivos .tbl reais que o usuário mandou) além de item/nome/lugar já
// cobertos acima. Fixtures são RECORTES REAIS (tag de preâmbulo sintético
// + 2-3 registros completos e reais) dos arquivos correspondentes dentro
// de Text.zip — cada profile foi validado rodando contra o arquivo INTEIRO
// em Node antes de virar teste (contagem documentada no comentário de cada
// profile em core.js). O preâmbulo aqui é sintético (só "tag\0", sem os
// milhares de bytes reais de antes do 1º registro) pra manter a fixture
// pequena — não muda nada no parsing, já que só a POSIÇÃO da 1ª ocorrência
// importa (é sempre descartada como preâmbulo).
// ---------------------------------------------------------------------------
const REAL_TBL_TEXT_FIXTURE_HEX =
  "546578745461626c654461746100546578745461626c6544617461000a00000054616c6b20746f00546578745461626c6544617461000700010054616c6b00546578745461626c654461746100070002005269646500";
const REAL_TBL_ACTIVEVOICE_FIXTURE_HEX =
  "416374697665566f6963655461626c654461746100416374697665566f6963655461626c6544617461007100010001000100495f41564630303030007869000054686520656e7472616e6365206973207269676874206f7665722074686572652e204c65742773206d6f76650a6f757420617320736f6f6e2061732077652772652072656164792e000000803e0000803f090000120000000000000000416374697665566f6963655461626c6544617461005400010002000200495f415646303130300079690a005965732c207369722e0a284a757374207768617420746865206865636b20697320616c6c20746869733f29000000803f0000803f200000000000000000000000416374697665566f6963655461626c6544617461007000020003000100495f41564630323030007a691400596f75277665206a7573742063726f73736564207468652068616c6677617920706f696e742e0a42657374206f66206c75636b206f6e20746865207365636f6e642068616c6621000000803e0000803f090001120000000000000000";
const REAL_TBL_MAPJUMP_FIXTURE_HEX =
  "4d61704a756d7044617461004d61704a756d7044617461003800010085030046726f6e7420456e7472616e6365000100512374303230300030000000000000000000000080bf00003443c6020c03010001004d61704a756d704461746100350002008503005363686f6f6c202d20314600010052237430323130003000cdccccbd0000000066662641000034431806b302020002004d61704a756d704461746100350003008503005363686f6f6c202d2032460001005323743032313000300000009840000090400000e0bf000000001806fc0103000300";
const REAL_TBL_QUESTTITLE_FIXTURE_HEX =
  "51535469746c650051535469746c65002c00c80001e3808845696e68656c2050726163746963616c204578616de38089003f3f3f000100010004000000000000000051535469746c65003500c90001e3808850616e7a657220536f6c64617420547261696e696e67202d20417072696ce38089003f3f3f000100010004000000000000000051535469746c65003400ca0001e38088556e6b6e6f776e204d6f6e7374657220496e7665737469676174696f6ee38089003f3f3f0001000100050000000000000000";
const REAL_TBL_MG08TEXT_FIXTURE_HEX =
  "4d47303854657874004d4730385465787400160000004175746f204275696c643a2042616c616e6365004d47303854657874001b0001004175746f204275696c643a204e617469616c20466f637573004d47303854657874001a0002004175746f204275696c643a204d6167696320466f63757300";
const REAL_TBL_MONSTER_FIXTURE_HEX =
  "737461747573007374617475730046016d6f6e30303200435f4d4f4e303032006d6f6e303032000000803f0000c03f3333333f0000803f000000000000c04000002041010001000006660000000000c642fa00fa00c80000002f000000a0412c000000704130000000a0412e00000070412d00cdcc4c3e0a00cdcccc3d000023000000003f04000000000004000000803fc80000000000b4645064646464969632c89696643296646464966432966400c80064003200000200000000010100000000cdcc4c3e000000000000000000000000000000000000000000000000280c0f2400056666663fcdcc8c3f4d004a6577656c656420526970706572004120686f726e656420726174206d6f6e737465722e0a53746f726573206d616e6120696e207468652067656d206f6e0a697473207461696c20616e6420636173747320617274730a7768656e20746872656174656e65642e00737461747573003c016d6f6e30303100435f4d4f4e303031006d6f6e30303100cdcc4c3f0000c03fcdcc4c3f6666a63f0000000000000041000020410100010000067700000000001b4390019001c800000042000000a04182000000f04140000000a0410000000000003700cdcc4c3e1400cdcccc3d00002a000000003f080000000000080000000040b40000000000508cc88c646464c86432323264c86432c8c832329632c832003200c80064000100000301000002cdcc4c3d00000000000000009a99193e9a99993d0000000000000000cdcccc3d290c143c00056666663fcdcc8c3f4d004361726162617365004120666c79696e6720696e73656374206d6f6e737465722e0a497473206272696768742c20737475726479207368656c6c0a70726f74656374732069742066726f6d0a706879736963616c2061747461636b732e00";
const REAL_TBL_LINKABILITY_FIXTURE_HEX =
  "4c696e6b416254657874004c696e6b416254657874002d00004c696e6b2041747461636b00416c6c6f77732074686520757365206f66206c696e6b2061747461636b732e004c696e6b4162546578740054000546696e697368696e6720426c6f7700466f6c6c6f7773206173736973742061747461636b73207769746820612066696e697368696e6720626c6f772069662074686520666f6520686173206c6f772048502e004c696e6b416254657874004c000a506f77657266756c20537472696b6500496e637265617365732066696e697368696e6720626c6f77277320706f77657220616e642061637469766174696f6e206672657175656e63792e00";

function profileById(id) {
  const p = core.TBL_TABLE_PROFILES.find((x) => x.id === id);
  assert.ok(p, `profile ${id} deveria existir`);
  return p;
}

test("parseTaggedTableByProfile (text/TextTableData): rotulos curtos de UI, 3 registros reais", () => {
  const r = core.parseTaggedTableByProfile(fixtureBytes(REAL_TBL_TEXT_FIXTURE_HEX), profileById("text"));
  assert.equal(r.records.length, 3);
  assert.equal(r.unrecognized, 0);
  assert.deepEqual(r.records.map((rec) => rec.fields.text.text), ["Talk to", "Talk", "Ride"]);
});

test("parseTaggedTableByProfile (activevoice/ActiveVoiceTableData): fala no 5o campo (indice 4)", () => {
  const r = core.parseTaggedTableByProfile(fixtureBytes(REAL_TBL_ACTIVEVOICE_FIXTURE_HEX), profileById("activevoice"));
  // o 1o registro real do arquivo (idField=1, "The entrance is right over
  // there...") tem outro campo mais adiante que nao fecha limpo dentro do
  // recorte de 3 registros da fixture, entao fica de fora (unrecognized) —
  // mesmo comportamento contra o arquivo INTEIRO (592 registros, 257
  // reconhecidos: cobertura parcial documentada no profile, nao é bug).
  assert.ok(r.records.length >= 2);
  assert.equal(r.records[0].fields.text.text, "Yes, sir.\n(Just what the heck is all this?)");
  assert.equal(r.records[1].fields.text.text, "You've just crossed the halfway point.\nBest of luck on the second half!");
});

test("parseTaggedTableByProfile (mapjump/MapJumpData): nome do destino no 2o campo (indice 1)", () => {
  const r = core.parseTaggedTableByProfile(fixtureBytes(REAL_TBL_MAPJUMP_FIXTURE_HEX), profileById("mapjump"));
  assert.equal(r.records.length, 3);
  assert.equal(r.unrecognized, 0);
  assert.deepEqual(r.records.map((rec) => rec.fields.text.text), ["Front Entrance", "School - 1F", "School - 2F"]);
});

test("parseTaggedTableByProfile (questtitle/QSTitle): titulo entre () , 1 byte de controle removido do inicio", () => {
  const r = core.parseTaggedTableByProfile(fixtureBytes(REAL_TBL_QUESTTITLE_FIXTURE_HEX), profileById("questtitle"));
  assert.equal(r.records.length, 3);
  assert.equal(r.unrecognized, 0);
  assert.equal(r.records[0].fields.text.text, "〈Einhel Practical Exam〉");
  // confirma que o byte de controle (\x01, rank) NAO sobrou grudado no texto
  assert.equal(r.records[0].fields.text.text.charCodeAt(0), 0x3008);
});

test("parseTaggedTableByProfile (mg08text/MG08Text): texto unico de UI de minigame, 3 registros reais", () => {
  const r = core.parseTaggedTableByProfile(fixtureBytes(REAL_TBL_MG08TEXT_FIXTURE_HEX), profileById("mg08text"));
  assert.equal(r.records.length, 3);
  assert.equal(r.unrecognized, 0);
  assert.deepEqual(r.records.map((rec) => rec.fields.text.text), ["Auto Build: Balance", "Auto Build: Natial Focus", "Auto Build: Magic Focus"]);
});

test("parseTaggedTableByProfile (monster/status): bestiario com nome (penultimo campo) + descricao (ultimo campo)", () => {
  const r = core.parseTaggedTableByProfile(fixtureBytes(REAL_TBL_MONSTER_FIXTURE_HEX), profileById("monster"));
  assert.equal(r.records.length, 2);
  assert.equal(r.unrecognized, 0);
  assert.equal(r.records[0].fields.name.text, "Jeweled Ripper");
  assert.match(r.records[0].fields.desc.text, /^A horned rat monster\./);
  assert.equal(r.records[1].fields.name.text, "Carabase");
  assert.match(r.records[1].fields.desc.text, /^A flying insect monster\./);
});

test("parseTaggedTableByProfile (linkability/LinkAbText): 1o registro tem campo vazio antes do nome, os demais tem byte de rank grudado (removido pelo stripLeadingControl)", () => {
  const r = core.parseTaggedTableByProfile(fixtureBytes(REAL_TBL_LINKABILITY_FIXTURE_HEX), profileById("linkability"));
  assert.equal(r.records.length, 3);
  assert.equal(r.unrecognized, 0);
  assert.equal(r.records[0].fields.name.text, "Link Attack");
  assert.equal(r.records[0].fields.desc.text, "Allows the use of link attacks.");
  assert.equal(r.records[1].fields.name.text, "Finishing Blow"); // sem o \x05 de rank grudado
  // registro 2 tem rank=0x0A, que por coincidencia É o codepoint de '\n' —
  // como '\n' é um caractere LEGITIMO em outros campos (quebra de linha de
  // diálogo), stripLeadingControl de propósito NÃO mexe nele (não dá pra
  // distinguir "rank 10" de "começa com quebra de linha de verdade" só
  // olhando o byte) — o \n sobra no início do nome nesse caso raro, sem
  // quebrar a edição (ainda é um campo editável normalmente).
  assert.equal(r.records[2].fields.name.text, "\nPowerful Strike");
});

test("applyTaggedTableFieldEdit sobre monster (2 campos por registro): edita so a descricao, nome do MESMO registro fica intacto, round-trip exato", () => {
  const original = fixtureBytes(REAL_TBL_MONSTER_FIXTURE_HEX);
  const profile = profileById("monster");
  const parsed1 = core.parseTaggedTableByProfile(original, profile);
  const rec = parsed1.records[0];

  const novaDesc = "Um rato monstruoso com chifre.\nGuarda mana na joia da\ncauda e conjura artes\nquando ameaçado.";
  const edited = core.applyTaggedTableFieldEdit(original, rec.start, rec.end, rec.tagFullLen, { start: rec.fields.desc.start, end: rec.fields.desc.end }, novaDesc);
  const parsed2 = core.parseTaggedTableByProfile(edited, profile);
  assert.equal(parsed2.records.length, 2);
  assert.equal(parsed2.records[0].fields.desc.text, novaDesc);
  assert.equal(parsed2.records[0].fields.name.text, "Jeweled Ripper"); // nome nao mudou
  assert.equal(parsed2.records[1].fields.name.text, "Carabase"); // proximo registro intacto
  assert.equal(parsed2.records[1].fields.desc.text, parsed1.records[1].fields.desc.text);

  const rec2 = parsed2.records[0];
  const undone = core.applyTaggedTableFieldEdit(edited, rec2.start, rec2.end, rec2.tagFullLen, { start: rec2.fields.desc.start, end: rec2.fields.desc.end }, rec.fields.desc.text);
  assert.equal(Buffer.compare(Buffer.from(undone), Buffer.from(original)), 0);
});

test("detectTblProfile: descobre sozinho o tipo certo pra cada fixture, sem o usuario escolher na mao", () => {
  const cases = [
    [REAL_TBL_TEXT_FIXTURE_HEX, "text"],
    [REAL_TBL_ACTIVEVOICE_FIXTURE_HEX, "activevoice"],
    [REAL_TBL_MAPJUMP_FIXTURE_HEX, "mapjump"],
    [REAL_TBL_QUESTTITLE_FIXTURE_HEX, "questtitle"],
    [REAL_TBL_MG08TEXT_FIXTURE_HEX, "mg08text"],
    [REAL_TBL_MONSTER_FIXTURE_HEX, "monster"],
    [REAL_TBL_LINKABILITY_FIXTURE_HEX, "linkability"],
    [REAL_TBL_NAME_FIXTURE_HEX, "name"],
    [REAL_TBL_PLACE_FIXTURE_HEX, "place"],
  ];
  for (const [hex, expectedId] of cases) {
    const detected = core.detectTblProfile(fixtureBytes(hex));
    assert.ok(detected, `deveria detectar algo pra ${expectedId}`);
    assert.equal(detected.id, expectedId);
  }
});

test("detectTblProfile: exige um minimo de registros pro item table (sentinel sem tag ancorando) pra nao dar falso positivo", () => {
  assert.equal(core.TBL_ITEM_DETECTION_MIN_RECORDS > 0, true);
  // um trecho pequeno demais (abaixo do minimo) nao deve ser aceito como "item",
  // mesmo que bata o padrao sentinel por acaso
  const tiny = fixtureBytes(REAL_TBL_MONSTER_FIXTURE_HEX); // nao tem sentinel de item nenhum
  const detected = core.detectTblProfile(tiny);
  assert.notEqual(detected && detected.kind, "item");
});
