// core.js — funcoes puras do Tradutor-CS3, extraidas do app HTML pra um
// modulo compartilhado entre o app (navegador) e o CLI headless
// (translate-cli.js). Sem dependencia de DOM/React/IndexedDB - so JS puro.
//
// Gerado a partir de Tradutor-CS3_6.html - se corrigir um bug aqui, replique
// a mesma correcao la (ou, no proximo passo de modularizacao, troque o app
// pra carregar ESTE arquivo via <script src="core.js"> em vez de manter as
// funcoes duplicadas).
"use strict";

    const PT_WORDS = new Set(["de","da","do","que","não","para","com","uma","um","os","as","dos","das","você","está","são","ele","ela","isso","esse","essa","muito","já","também","mas","se","na","no","pela","pelo","foi","ser","ter","como","seu","sua","nos","nas","eu","nós","meu","minha","aqui","ali","onde","quando","porque","então","até","depois","antes","sobre","entre","cada","todos","toda","todo","nenhum","nada","alguém","algo","obrigado","obrigada","olá","adeus","sim","não","por","favor",
      // Vocabulário de DIÁLOGO (o que este app traduz o tempo todo). A lista
      // original era de palavras gramaticais — artigos, preposições — que
      // quase não aparecem em fala curta ("Certo.", "Claro."). Sem nenhuma
      // palavra reconhecida, a detecção caía no trigrama, que em 6 caracteres
      // decide no ruído. Estas cobrem a fala curta típica de RPG.
      "certo","claro","desculpe","desculpa","bem","agora","ainda","sempre","nunca","tudo","vamos",
      "vou","quero","posso","pode","deve","fazer","disse","vez","hora","tempo","lugar","pessoa",
      "verdade","melhor","pior","mesmo","assim","apenas","talvez","enquanto","espere","pare",
      "olhe","veja","venha","volte","cuidado","perigo","ajuda","preciso","precisa","consegui",
      "conseguiu","entendi","entendo","sei","sabe","acho","acha","parece","estou","estamos",
      "estava","tenho","temos","tinha","será","seria","pois","logo","cedo","tarde","hoje","ontem",
      "amanhã","nunca","jamais","embora","porém","contudo","enfim","afinal","inclusive"]);

    const EN_WORDS = new Set(["the","and","you","is","are","to","of","in","this","that","was","were","with","for","not","have","has","will","would","can","on","at","it","be","as","but","they","we","my","your","i","me","him","her","them","what","when","where","why","how","who","which","there","here","from","into","about","before","after","because","then","than","just","only","all","some","any","none","thanks","hello","goodbye","yes","no","please","get","got","let","its","don't","didn't","can't","i'm","you're",
      // Simetria com o que foi feito no português: a lista original era de
      // palavras gramaticais, e faltava o vocabulário de DIÁLOGO. A ausência
      // de "do" era especialmente cara — "Do not push or run!" pontuava 1
      // pra português (por causa do "do" português) contra 1 pra inglês,
      // empatava, e a linha NÃO TRADUZIDA escapava do QA.
      "do","does","did","am","go","going","come","coming","know","knew","think","thought",
      "need","want","say","said","tell","told","see","saw","look","looking","wait","stop",
      "sorry","right","sure","okay","ok","up","down","out","over","back","again","still",
      "now","never","always","something","nothing","everything","everyone","someone",
      "very","really","much","more","most","less","too","also","even","never","ever",
      "man","time","way","thing","people","place","day","night","good","bad","great",
      // respostas curtas de diálogo. NÃO entram interjeições ("oh", "ah",
      // "hmm", "wow"): elas são iguais nos dois idiomas e marcariam
      // "Oh, Instrutor Schwarzer..." (português) como inglês.
      "understood","agreed","alright","yeah","yep","nope","indeed","certainly","maybe",
      "welcome","course","matter","worry","careful","dangerous","ready","done","finished"]);

    const LANG_SAMPLE_PT =
      "Bem-vindo à academia. Hoje é um novo dia e todos os alunos precisam se preparar para o exame. " +
      "Rean caminhou até a sala e cumprimentou seus amigos com um sorriso. Ele sabia que não seria fácil, " +
      "mas estava determinado a fazer o seu melhor. A professora explicou que a missão seria perigosa e que " +
      "cada um deveria confiar nos outros membros da equipe. Não podemos desistir agora, disse ela, olhando " +
      "para o grupo reunido no pátio. O sol brilhava sobre o campus enquanto os estudantes conversavam sobre " +
      "os planos para o fim de semana. Alguns queriam visitar a cidade, outros preferiam descansar e estudar " +
      "um pouco mais antes da próxima aula. De repente, um barulho estranho chamou a atenção de todos. Será " +
      "que é um ataque? perguntou alguém, com a voz cheia de preocupação. Precisamos verificar imediatamente, " +
      "respondeu o instrutor, pegando sua espada e correndo em direção ao portão principal. A tensão no ar " +
      "era palpável, mas ninguém queria demonstrar medo diante dos colegas. Juntos, eles enfrentariam " +
      "qualquer desafio que viesse pela frente, pois essa era a verdadeira força da nossa turma.";

    const LANG_SAMPLE_EN =
      "Welcome to the academy. Today is a new day and all the students need to prepare for the exam. Rean " +
      "walked to the classroom and greeted his friends with a smile. He knew it would not be easy, but he " +
      "was determined to do his best. The teacher explained that the mission would be dangerous and that " +
      "everyone should trust the other members of the team. We cannot give up now, she said, looking at the " +
      "group gathered in the courtyard. The sun shone over the campus while the students talked about their " +
      "plans for the weekend. Some wanted to visit the city, others preferred to rest and study a little " +
      "more before the next class. Suddenly, a strange noise caught everyone's attention. Could it be an " +
      "attack? someone asked, their voice full of worry. We need to check immediately, the instructor " +
      "replied, grabbing his sword and running toward the main gate. The tension in the air was palpable, " +
      "but nobody wanted to show fear in front of their classmates. Together, they would face whatever " +
      "challenge came their way, because that was the true strength of our class.";

    function buildTrigramCounts(text) {
      const counts = new Map();
      const words = text.toLowerCase().match(/[a-zà-ÿ']+/g) || [];
      for (const w of words) {
        const padded = `_${w}_`;
        for (let i = 0; i < padded.length - 2; i++) {
          const tri = padded.slice(i, i + 3);
          counts.set(tri, (counts.get(tri) || 0) + 1);
        }
      }
      return counts;
    }

    function rankTrigrams(counts, limit) {
      const ranked = new Map();
      Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .forEach(([tri], idx) => ranked.set(tri, idx));
      return ranked;
    }

    const TRIGRAM_PROFILE_SIZE = 300;

    const TRIGRAM_OUT_OF_PLACE = TRIGRAM_PROFILE_SIZE;

    const PT_TRIGRAM_PROFILE = rankTrigrams(buildTrigramCounts(LANG_SAMPLE_PT), TRIGRAM_PROFILE_SIZE);

    const EN_TRIGRAM_PROFILE = rankTrigrams(buildTrigramCounts(LANG_SAMPLE_EN), TRIGRAM_PROFILE_SIZE);

    function trigramDistance(inputRanked, profile) {
      let distance = 0;
      for (const [tri, inputRank] of inputRanked) {
        const refRank = profile.has(tri) ? profile.get(tri) : TRIGRAM_OUT_OF_PLACE;
        distance += Math.abs(inputRank - refRank);
      }
      return distance;
    }

    const TRIGRAM_MIN_MARGIN = 0.25;

    function detectLanguageByTrigram(text) {
      const counts = buildTrigramCounts(text);
      if (counts.size === 0) return null;
      const ranked = Array.from(rankTrigrams(counts, TRIGRAM_PROFILE_SIZE).entries());
      const ptDist = trigramDistance(ranked, PT_TRIGRAM_PROFILE);
      const enDist = trigramDistance(ranked, EN_TRIGRAM_PROFILE);
      if (ptDist === enDist) return null;

      // O trigrama SEMPRE devolve um vencedor, mesmo quando os dois perfis
      // estão praticamente empatados — e aí o "vencedor" é ruído. Numa linha
      // como "Oh, Instrutor Schwarzer...", que é quase só nome próprio, não
      // existe evidência de idioma nenhum: os dois perfis ficam a 9% um do
      // outro e o desempate vira sorteio. Era exatamente isso que marcava
      // linha em PORTUGUÊS como inglês no QA.
      const menor = Math.min(ptDist, enDist);
      const margemRelativa = menor > 0 ? Math.abs(ptDist - enDist) / menor : 0;
      if (margemRelativa < TRIGRAM_MIN_MARGIN) return null;

      return ptDist < enDist ? "pt" : "en";
    }

    function detectLanguage(text) {
      // remove códigos de controle do script e quebras de linha antes de analisar
      const stripped = text.replace(/#[A-Za-z0-9_\[\]]+/g, " ").replace(/[\r\n]+/g, " ");
      const lower = stripped.toLowerCase();
      const ptChars = (lower.match(/[ãõçáéíóúâêôàü]/g) || []).length;
      const tokens = lower.match(/[a-zà-ÿ']+/g) || [];
      let wordPtScore = 0;
      let wordEnScore = 0;
      for (const t of tokens) {
        const ehPt = PT_WORDS.has(t);
        const ehEn = EN_WORDS.has(t);
        // Palavra que existe nos DOIS idiomas ("as", "no", "do"...) não é
        // evidência de nenhum: contá-la pros dois lados só cria empate
        // artificial e joga a linha pra "unknown" à toa.
        if (ehPt && ehEn) continue;
        if (ehPt) wordPtScore += 1;
        if (ehEn) wordEnScore += 1;
      }

      // Evidência de PALAVRA reconhecida (artigo, pronome, preposição etc.)
      // é muito mais confiável que um acento sozinho — nome próprio
      // estilizado ou empréstimo em inglês (ex.: "café", "Beatriz") pode ter
      // acento sem a frase ser português. Por isso: se achou pelo menos uma
      // palavra reconhecida de um idioma e NENHUMA do outro, esse idioma
      // vence — mesmo que o texto tenha 1-2 acentos perdidos no meio.
      if (wordEnScore > 0 && wordPtScore === 0) return "en";
      if (wordPtScore > 0 && wordEnScore === 0) return "pt";
      if (wordPtScore > wordEnScore) return "pt";
      if (wordEnScore > wordPtScore) return "en";

      // Chegou aqui só quando NENHUMA palavra da lista foi reconhecida de
      // nenhum dos dois lados (empate 0-0) OU as duas listas empataram com
      // sinal real dos dois lados (frase mista/ambígua) — nesse segundo caso
      // é mais seguro devolver "unknown" (nunca é pulado do lote automático)
      // do que arriscar marcar como "pt" com base em pouca certeza.
      if (wordPtScore > 0 && wordPtScore === wordEnScore) return "unknown";

      // sinal fraco de verdade (0 palavras reconhecidas dos dois lados): usa
      // acento de verdade como pista de pt. O perfil de trigramas NÃO decide
      // mais "pt" sozinho nesse ponto — nome próprio/interjeição curta ("Alisa!",
      // "Fie...") pode compartilhar trigrama com palavras em português só por
      // coincidência estatística, e isso gerava falso positivo "pt" pra linha
      // que é claramente inglês (o motivo original desse bug reportado). O
      // trigrama só serve aqui pra puxar pra "en" quando há sinal disso;
      // fora isso, "unknown" é a resposta mais honesta (nunca é pulado do
      // lote automático).
      if (ptChars > 0) return "pt";

      // Guarda de COMPRIMENTO (a causa real dos falsos positivos "ainda em
      // inglês"): o perfil de trigramas precisa de amostra pra significar
      // alguma coisa. Em "Certo." são 4 trigramas — qualquer coincidência
      // vira "sinal", e o resultado é praticamente sorteio. Foi medido: das
      // traduções curtas corretas em português, 10% eram marcadas como
      // inglês por causa disso. Abaixo do mínimo, a resposta honesta é
      // "não sei" — e "unknown" nunca gera aviso nem é pulado do lote.
      const TRIGRAM_MIN_CHARS = 20;
      if (stripped.trim().length < TRIGRAM_MIN_CHARS) return "unknown";

      const byTrigram = detectLanguageByTrigram(stripped);
      return byTrigram === "en" ? "en" : "unknown";
    }

    function baseName(fileName) {
      return fileName.replace(/\.xlsx$/i, "");
    }

    function safeForFilename(name) {
      return name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Projeto";
    }

    function escapeXml(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    }

    function tmxTimestamp(ms) {
      const d = ms ? new Date(ms) : new Date();
      return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    }

    // O trecho "#X[...]" aceita UM nível de colchete aninhado:
    // \[(?:[^\[\]]|\[[^\[\]]*\])*\]  em vez do antigo  \[[^\]]*\].
    //
    // Motivo real, achado num diagnóstico de QA de 66 mil linhas:
    //   #E[99999999999999999999999999999[autoE8]]
    // O padrão antigo parava no PRIMEIRO "]", então casava só
    // "#E[99999999999999999999999999999[autoE8]" e deixava um "]" solto no
    // texto. Esse "]" órfão ia pro modelo junto com a frase e, na volta, o
    // "#M_A#B_0" que vinha logo depois se perdia — o único problema CRÍTICO
    // do relatório inteiro.
    //
    // A alternância não é gulosa a ponto de atravessar códigos vizinhos:
    // [^\[\]] exclui os dois colchetes, então "#E[1]#M_0" nunca vira um
    // casamento só.
    const CODE_REGEX_SOURCE = /#[EeMBHVKkF]\[(?:[^\[\]]|\[[^\[\]]*\])*\]|#[EeMBHVKkF]_.|#[EeMBHVKkF]|#[IiPTWSsCcxyGDUR]|#\d+[A-Za-z]/;

    function matchAllCodes(text) {
      const re = new RegExp(CODE_REGEX_SOURCE.source, "g");
      const matches = [];
      let m;
      while ((m = re.exec(text)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
        if (m[0].length === 0) re.lastIndex++;
      }
      return matches;
    }

    const CODE_GLOSSARY = [
      { key: "E", re: /^#[Ee]\[?/, label: "Expressão (retrato)", confidence: "inferido", note: "Troca a expressão do retrato do personagem. Aparece quase sempre junto com #M_ e #B_." },
      { key: "M", re: /^#M_/, label: "Boca (fala)", confidence: "inferido", note: "Controla a forma/animação da boca durante a fala." },
      { key: "B", re: /^#B_/, label: "Piscar (olhos)", confidence: "inferido", note: "Controla o estado de piscar dos olhos do retrato." },
      { key: "H", re: /^#H/, label: "Desconhecido (grupo retrato)", confidence: "desconhecido", note: "Faz parte do mesmo grupo estrutural de E/M/B/V/K/F, mas função exata não confirmada." },
      { key: "V", re: /^#V/, label: "Desconhecido (possível voz)", confidence: "desconhecido", note: "Estrutura sugere referência a algum recurso (talvez clipe de voz), não confirmado." },
      { key: "K", re: /^#[Kk]/, label: "Desconhecido", confidence: "desconhecido", note: "Função exata não documentada." },
      { key: "F", re: /^#F/, label: "Desconhecido", confidence: "desconhecido", note: "Função exata não documentada." },
      { key: "simples", re: /^#[IiPTWSsCcxyGDUR]$/, label: "Código de formatação simples", confidence: "desconhecido", note: "Letra reconhecida pelo parser do decompilador como início de código, mas função (cor/pausa/ícone?) não documentada." },
      { key: "fmt-digit", re: /^#\d/, label: "Código de formatação (dígito+letra)", confidence: "desconhecido", note: "Padrão observado no texto (ex: #1C, #0G). Provavelmente cor/estilo do texto — função exata não documentada." },
    ];

    function classifyCode(code) {
      for (const entry of CODE_GLOSSARY) {
        if (entry.re.test(code)) return entry;
      }
      return { key: "outro", label: "Código não catalogado", confidence: "desconhecido", note: "Ainda não apareceu nos padrões conhecidos — mantenha exatamente como está." };
    }

    function extractCodes(text) {
      if (typeof text !== "string") return [];
      return matchAllCodes(text).map((m) => m.text);
    }

    function protectCodes(text) {
      const rawMatches = matchAllCodes(text);
      if (rawMatches.length === 0) return { protectedText: text, tokens: [] };

      // junta trechos consecutivos (sem texto normal entre eles) num só
      const merged = [];
      for (const mt of rawMatches) {
        const last = merged[merged.length - 1];
        if (last && last.end === mt.start) {
          last.end = mt.end;
          last.text += mt.text;
        } else {
          merged.push({ ...mt });
        }
      }

      let result = "";
      let cursor = 0;
      const tokens = [];
      for (const span of merged) {
        result += text.slice(cursor, span.start);
        const idx = tokens.length;
        // true quando o código está colado ao texto vizinho no ORIGINAL
        // (sem espaço) — restoreCodes usa isso pra remover o espaço que
        // inserimos aqui embaixo só de ajuda pro motor de tradução.
        const glueBefore = result.length > 0 && !/\s$/.test(result);
        result += (glueBefore ? " " : "") + `§${idx}§`;
        const nextChar = text[span.end];
        const glueAfter = !!nextChar && !/\s/.test(nextChar);
        if (glueAfter) result += " ";
        tokens.push({ text: span.text, glueBefore, glueAfter });
        cursor = span.end;
      }
      result += text.slice(cursor);
      return { protectedText: result, tokens };
    }

    function restoreCodes(text, tokens) {
      return text.replace(/(\s*)§\s*(\d+)\s*§(\s*)/g, (m, before, idx, after) => {
        const tok = tokens[Number(idx)];
        if (tok === undefined) return m;
        if (typeof tok === "string") return `${before}${tok}${after}`;
        const keepBefore = tok.glueBefore ? "" : before;
        const keepAfter = tok.glueAfter ? "" : after;
        return `${keepBefore}${tok.text}${keepAfter}`;
      });
    }

    function restoreCodesTolerant(text, tokens) {
      // 1) passe estrito primeiro (marcador bem formado, "§0§")
      let out = restoreCodes(text, tokens);
      if (!tokens || tokens.length === 0) return out;

      // 2) O passe tolerante só age sobre os marcadores que o estrito NÃO
      //    conseguiu restaurar. Antes ele varria "§ + dígitos" em qualquer
      //    lugar, e isso tinha um falso positivo real: numa linha com dois
      //    códigos, se o "§0§" foi restaurado corretamente e o texto contém
      //    por acaso um "§1" comum, o segundo era destruído.
      //    Se o código já está no resultado, um "§N" remanescente é texto —
      //    não é marcador nosso.
      const pendentes = new Set();
      tokens.forEach((tok, i) => {
        const texto = typeof tok === "string" ? tok : tok.text;
        if (!out.includes(texto)) pendentes.add(i);
      });
      if (pendentes.size === 0) return out;

      out = out.replace(/§\s*(\d+)/g, (m, idx) => {
        const i = Number(idx);
        if (!pendentes.has(i)) return m; // este já foi restaurado: deixa quieto
        const tok = tokens[i];
        if (tok === undefined) return m;
        return typeof tok === "string" ? tok : tok.text;
      });
      return out;
    }

    function findLeakedMarkers(text) {
      const s = String(text || "");
      const achados = [];
      for (const re of [/§\s*\d+\s*§?/g, /¤\s*\d+\s*¤?/g, /‡\s*\d+\s*‡?/g]) {
        const m = s.match(re);
        if (m) achados.push(...m);
      }
      return achados;
    }

    function temConteudoDeTexto(s) {
      const semMarcador = String(s == null ? "" : s)
        .replace(/§\s*\d+\s*§?/g, " ")
        .replace(/¤\s*\d+\s*¤?/g, " ")
        .replace(/‡\s*\d+\s*‡?/g, " ");
      return /[\p{L}\p{N}]/u.test(semMarcador);
    }

    // Loop degenerativo: qualquer trecho de 2 a 8 caracteres repetido 4+
    // vezes seguidas. Sintoma clássico de modelo quantizado travando em
    // decodificação gulosa — caso real do diagnóstico de QA:
    //   "E-Eh-- E-Eu-- E-Er-- De-De-De-De-De-De-De-Realmente?!"
    // Repare que a gagueira LEGÍTIMA ("E-Eh--", "N-Não") nunca passa de 1-2
    // repetições — é estilo de localização real (ver Padroes_e_Costumes.md
    // do projeto CS1: "adaptar gagueira foneticamente"). O que diferencia
    // loop de gagueira aqui não é a forma, é a CONTAGEM: 4+ repetições
    // IDÊNTICAS do mesmo trecho não é como ninguém gagueja de verdade.
    function temLoopDegenerativo(texto) {
      return /(.{2,8})\1{3,}/.test(String(texto == null ? "" : texto));
    }

    // Resposta desproporcionalmente curta pro tamanho do original — sintoma
    // de alucinação, não de tradução concisa. Caso real: um original de 3
    // linhas sobre "mel de Armorica, sal de Bareahard..." voltou como
    // "Cerveja seca... Certo!", conteúdo completamente não relacionado.
    // O perigo desse tipo de falha é que ela às vezes NÃO muda a contagem
    // de linha (então o QA de "line-mismatch" não pega) e não tem nenhum
    // marcador quebrado (então nada mais acusa nada) — ela só passa por
    // "tradução válida, mas errada", em silêncio.
    //
    // Limiar calibrado contra dados reais: traduções genuínas do PT-BR
    // (que tende a ficar do mesmo tamanho do inglês ou um pouco maior)
    // ficaram em 0.49-0.51 nos exemplos mais enxutos testados; as
    // alucinações reais do relatório de QA ficaram em 0.03-0.29. 0.35 fica
    // bem no meio, puxado pro lado que prefere pegar demais a deixar
    // passar — o custo de um falso positivo aqui é só uma retentativa a
    // mais, bem mais barato que uma linha com conteúdo errado no jogo.
    // Só entra em ação pra original com conteúdo de verdade (40+
    // caracteres) — original curto com tradução curta é o esperado, não
    // teria como distinguir de uma alucinação sem arriscar falso positivo
    // demais.
    function respostaMuitoCurtaParaOriginal(protectedText, translatedCore) {
      const origLen = String(protectedText == null ? "" : protectedText).trim().length;
      if (origLen < 40) return false;
      const tLen = String(translatedCore == null ? "" : translatedCore).trim().length;
      if (tLen === 0) return false; // isso é modelReturnedNothing, não este
      return tLen / origLen < 0.35;
    }

    // Código do jogo que sumiu na tradução final (comparando com o
    // original INTEIRO, depois da remontagem) — pega o caso que
    // prepareForLlm não consegue prevenir: código de FORMATAÇÃO no MEIO da
    // frase, tipicamente em PARES tipo "#3C...#1C" (abre/fecha destaque),
    // que só vira marcador §N§ (não é arrancado de ponta como
    // prepareForLlm faz com os códigos das bordas). Caso real:
    //   "...to the #3Cbranch campus via the #3CQuick Travel Menu#1C."
    // virou 3 marcadores (§0§ #163I, §1§ #3C, §2§ #1C) e o modelo perdeu
    // 2 dos 3 na resposta. checkEntryIssues já detecta isso DEPOIS de
    // salvo, pro QA; esta função detecta ANTES de salvar, pra virar
    // retentativa em vez de exigir revisão manual depois.
    function codeCountRegrediu(original, translatedText) {
      const codigos = extractCodes(String(original == null ? "" : original));
      if (codigos.length === 0) return false;
      const texto = String(translatedText == null ? "" : translatedText);
      for (const [code, esperado] of countOccurrencesByCode(codigos).entries()) {
        if (countOccurrences(texto, code) < esperado) return true;
      }
      return false;
    }

    // ---------------------------------------------------------------------------
    // Revisor de coerência (IA) — pedido explícito do usuário: um passe
    // SEPARADO da tradução, que pega um par (original, tradução JÁ FEITA) e
    // pergunta pro mesmo motor configurado "isso quer dizer a mesma coisa?".
    // É deliberadamente distinto dos outros guardas deste arquivo
    // (codeCountRegrediu, temLoopDegenerativo, isWrongScript etc.), que
    // pegam sintoma MECÂNICO (código sumindo, idioma errado, repetição) sem
    // entender o SENTIDO da frase. Só um modelo de linguagem consegue
    // avaliar se "o gerente da filial" e "a filial do gerente" — que passam
    // limpo por todo guarda mecânico — significam coisas diferentes.
    //
    // Roda SOB DEMANDA (botão manual), nunca automático: é uma segunda
    // chamada de API por linha JÁ TRADUZIDA, então tem custo real e não
    // deveria rodar escondido.
    // ---------------------------------------------------------------------------

    // Faixa de 0 a 100. Só vira problema de QA abaixo de COHERENCE_OK_MIN —
    // nota alta não gera ruído nenhum na lista. Abaixo de
    // COHERENCE_CRITICAL_MAX vira CRÍTICO (mesmo padrão de wrong-language: a
    // evidência de que o sentido mudou é forte o bastante pra bloquear
    // exportação); entre os dois limiares fica como AVISO, revisão
    // recomendada mas não bloqueante — o revisor pode errar pra menos numa
    // tradução livre/idiomática que está correta.
    const COHERENCE_CRITICAL_MAX = 40;
    const COHERENCE_OK_MIN = 70;

    function coherenceIssueSeverity(nota) {
      if (typeof nota !== "number" || Number.isNaN(nota)) return null;
      if (nota >= COHERENCE_OK_MIN) return null; // nota boa: não é problema
      return nota < COHERENCE_CRITICAL_MAX ? "critical" : "warning";
    }

    // Issue sintético igual makeTranslationFailedIssue: não faz parte de
    // checkEntryIssues de propósito, porque checkEntryIssues só olha o
    // CONTEÚDO da linha, e a nota de coerência não vem do conteúdo sozinho —
    // vem de um veredito já computado e guardado em doc.coherenceReview.
    // Quem injeta isso na lista é runQualityCheck, do mesmo jeito que já
    // faz com translation-failed.
    function makeCoherenceIssue(review) {
      if (!review) return null;
      const severity = coherenceIssueSeverity(review.nota);
      if (!severity) return null;
      return {
        severity,
        type: "coherence-low",
        detail: `nota de coerência: ${review.nota}/100 — ${review.explicacao && review.explicacao.trim() ? review.explicacao.trim() : "sentido pode ter divergido do original"}`,
      };
    }

    // Instrução pro modelo AVALIAR, não traduzir. A distinção mais
    // importante do prompt é "sentido, não estilo" — sem ela, um modelo
    // puxado pra ser exigente penaliza toda tradução livre/idiomática (que é
    // o normal em localização de diálogo de jogo) como se fosse erro.
    function buildCoherenceReviewSystemPrompt() {
      return [
        "Você é um REVISOR de tradução (inglês -> português do Brasil) de diálogos do jogo Trails of Cold Steel III.",
        "Você NÃO traduz — sua única tarefa é avaliar se cada TRADUÇÃO JÁ FEITA é COERENTE com o ORIGINAL, ou seja, se transmite o MESMO SENTIDO.",
        "",
        'Para cada par receba um "original" e uma "traducao" e devolva:',
        '- "nota": número inteiro de 0 a 100. 100 = mesmo sentido, nada omitido, nada inventado. 0 = sentido completamente diferente ou texto alucinado, sem relação nenhuma com o original.',
        '- "explicacao": uma frase curta (até ~25 palavras) em português explicando o que diverge (omissão, invenção, mudança de sentido, tom errado etc). Se a nota for 100, pode devolver "explicacao" como string vazia.',
        "",
        "REGRAS IMPORTANTES:",
        "- Avalie só SENTIDO. Não penalize estilo, fraseado natural do português, escolha de palavra diferente que ainda diz a mesma coisa, ou tradução livre/idiomática.",
        "- Códigos técnicos do jogo entre # (como #E[1], #M_0, #3C, #K, #1P) são marcadores de formatação — ignore-os na avaliação, eles não fazem parte do texto a comparar.",
        "- Não penalize quebra de linha diferente entre original e tradução.",
        "- Gíria, calão e gagueira adaptada foneticamente são esperados em localização de diálogo e não são erro.",
        "- Se a tradução estiver vazia (ou só com espaço) e o original não, dê nota 0.",
        "",
        'Você vai receber um objeto JSON no formato {"pares": [{"id": 1, "original": "...", "traducao": "..."}, ...]}.',
        'Responda APENAS com um objeto JSON válido no formato {"reviews": [{"id": 1, "nota": 92, "explicacao": ""}, ...]}, com EXATAMENTE o mesmo número de itens da entrada, na MESMA ORDEM, e "id" batendo com o par correspondente. Nenhum texto antes ou depois, sem markdown, sem \`\`\`json.',
      ].join("\n");
    }

    function buildCoherenceReviewUserContent(pairs) {
      return JSON.stringify({
        pares: pairs.map((p, i) => ({ id: i + 1, original: p.original, traducao: p.traducao })),
      });
    }

    // Mesma tolerância de parse do parseBatchTranslationResponse (cerca de
    // markdown, aceita array solto OU objeto com a chave certa) — só troca
    // "translations"/string por "reviews"/{nota,explicacao}. Nota fora da
    // faixa é grampeada em vez de rejeitar o item inteiro: um 100.0 ou um
    // -5 por erro de arredondamento do modelo não deveriam derrubar o lote
    // todo pro fallback item a item.
    function parseCoherenceReviewResponse(raw, expectedLength) {
      let cleaned = String(raw == null ? "" : raw).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        throw new Error("resposta do revisor não é um JSON válido");
      }
      const arr = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.reviews) ? parsed.reviews : null;
      if (!Array.isArray(arr)) throw new Error('resposta do revisor sem a lista "reviews" esperada');
      if (arr.length !== expectedLength) {
        throw new Error(`resposta do revisor com ${arr.length} item(ns), esperava ${expectedLength}`);
      }

      // Bug real encontrado em produção: o schema pede "id" batendo com o
      // par de entrada, mas nada garante que a ORDEM do array de saída
      // siga a ordem de entrada — schema (mesmo forçado pela API) valida a
      // FORMA de cada item, não a posição relativa entre eles. Um modelo
      // local rodando em lote de 20 pode devolver os itens fora de ordem
      // com "id" correto em cada um, e o código antigo, que só confiava na
      // posição do array, aplicava o veredito de UM par no LUGAR ERRADO —
      // caso real: "Girl's Voice" -> "Voz da Garota" (tradução correta)
      // recebeu nota 0 "Texto vazio", verdito que era de outro par do
      // mesmo lote. Se os ids formam uma permutação válida de
      // 1..expectedLength, remonta pela ordem real; senão (ids ausentes,
      // repetidos ou fora da faixa — caso de modelo que não obedeceu o
      // schema de "id"), cai de volta pra ordem posicional, que era o
      // comportamento de sempre.
      const ids = arr.map((r) => (r && typeof r === "object" ? Number(r.id) : NaN));
      const idsValidos =
        ids.every((id) => Number.isInteger(id) && id >= 1 && id <= expectedLength) &&
        new Set(ids).size === expectedLength;
      let ordered = arr;
      if (idsValidos) {
        ordered = new Array(expectedLength);
        arr.forEach((r, idx) => { ordered[ids[idx] - 1] = r; });
      }

      return ordered.map((r) => {
        const notaBruta = r && typeof r === "object" ? Number(r.nota) : NaN;
        const nota = Number.isFinite(notaBruta) ? Math.max(0, Math.min(100, Math.round(notaBruta))) : 0;
        const explicacao = r && typeof r.explicacao === "string" ? r.explicacao.trim().slice(0, 300) : "";
        return { nota, explicacao };
      });
    }

    function modelReturnedNothing(protectedText, translatedCore) {
      if (!temConteudoDeTexto(protectedText)) return false;
      return !temConteudoDeTexto(translatedCore);
    }

    // O modelo devolveu a ENTRADA de volta, sem traduzir.
    //
    // Num diagnóstico de 66 mil linhas isso apareceu 158 vezes, e sempre nos
    // mesmos três formatos: gagueira com hífen ("W-Was that Allie?!",
    // "H-How can this be...?!"), caixa alta ("DOST THOU DESIRE THE POWER?")
    // e fala entre aspas. O modelo pequeno lê esses padrões como código ou
    // nome próprio e faz passthrough.
    //
    // O freio de duas palavras + detectLanguage==="en" é o que separa falha
    // de acerto. Muita coisa DEVE voltar igual — "Valimar", "Rean
    // Schwarzer", "Class VII", "Hmph.", "..." — e essas caem em "unknown" ou
    // em uma palavra só. Medido contra as amostras reais do relatório: pega
    // 8 dos 11 casos de passthrough e zero dos que deveriam ficar iguais.
    // Os 3 que escapam são interjeição de uma palavra ("Y-Yeah!"), onde o
    // dano é pequeno e a ambiguidade com nome próprio é grande.
    function looksLikeUntranslated(sourceCore, translatedCore) {
      const a = String(sourceCore == null ? "" : sourceCore).trim();
      const b = String(translatedCore == null ? "" : translatedCore).trim();
      if (!a || a !== b) return false;
      const palavras = a
        .replace(/[#§¤‡]\S*/g, " ")
        .split(/\s+/)
        .filter((w) => /[\p{L}]/u.test(w));
      if (palavras.length < 2) return false;
      return detectLanguage(a) === "en";
    }

    function findInventedCodes(original, translation) {
      const esperados = countOccurrencesByCode(extractCodes(String(original || "")));
      const obtidos = countOccurrencesByCode(extractCodes(String(translation || "")));
      const extras = [];
      for (const [code, qtd] of obtidos.entries()) {
        const permitido = esperados.get(code) || 0;
        if (qtd > permitido) extras.push(permitido === 0 ? code : `${code} (${qtd}x, original tem ${permitido})`);
      }
      return extras;
    }

    function prepareForLlm(flatOriginal) {
      const { lead, core, trail } = splitLeadingTrailingCodes(String(flatOriginal || ""));
      const leadGap = (core.match(/^\s*/) || [""])[0];
      const trailGap = (core.match(/\s*$/) || [""])[0];
      const coreTrimmed = core.trim();
      // só o miolo é protegido com marcador
      const { protectedText, tokens } = protectCodes(coreTrimmed);
      return {
        lead,
        leadGap,
        trail,
        trailGap,
        protectedText,
        tokens,
        // linha que é SÓ código não precisa ir pro modelo: não há o que traduzir
        nothingToTranslate: coreTrimmed === "",
      };
    }

    function reassembleFromLlm(prep, translatedCore) {
      const restored = restoreCodesTolerant(String(translatedCore || ""), prep.tokens);
      return prep.lead + prep.leadGap + restored.trim() + prep.trailGap + prep.trail;
    }

    function sanitizeTranslation(original, translated) {
      let out = String(translated || "");

      // 1) marcador de proteção que sobrou sem par: vira nada. Se ficasse,
      //    apareceria literalmente na tela do jogo.
      out = out.replace(/§\s*\d+\s*§?/g, "").replace(/¤\s*\d+\s*¤?/g, "").replace(/‡\s*\d+\s*‡?/g, "");

      // 2) código que o modelo inventou (não existe no original, ou aparece
      //    mais vezes que lá): remove o excedente, da direita pra esquerda
      //    pra não bagunçar as posições de quem fica.
      const permitido = countOccurrencesByCode(extractCodes(String(original || "")));
      const usados = new Map();
      const marcados = matchAllCodes(out);
      const remover = [];
      for (const m of marcados) {
        const jaUsado = usados.get(m.text) || 0;
        if (jaUsado >= (permitido.get(m.text) || 0)) remover.push(m);
        else usados.set(m.text, jaUsado + 1);
      }
      for (let i = remover.length - 1; i >= 0; i--) {
        out = out.slice(0, remover[i].start) + out.slice(remover[i].end);
      }

      return out.replace(/\s{2,}/g, " ").trim();
    }

    function validateTranslationIntegrity(original, translated) {
      const leaked = findLeakedMarkers(translated);
      if (leaked.length > 0) {
        return { ok: false, reason: `sobrou marcador de proteção no texto (${leaked.slice(0, 3).join(" ")}) — o modelo corrompeu os marcadores` };
      }
      const inventados = findInventedCodes(original, translated);
      if (inventados.length > 0) {
        return { ok: false, reason: `o modelo inventou código de jogo que não existe no original (${inventados.slice(0, 3).join(" ")})` };
      }
      if (isWrongScript(translated)) {
        return { ok: false, reason: "a resposta veio em outro idioma (escrita não-latina)" };
      }
      return { ok: true, reason: null };
    }

    function utf8Length(s) {
      return new TextEncoder().encode(s).length;
    }

    const PUNCT_REGEX = /\.\.\.|…|\(|\)/g;

    function protectPunctuation(text) {
      PUNCT_REGEX.lastIndex = 0;
      const rawMatches = [];
      let m;
      while ((m = PUNCT_REGEX.exec(text)) !== null) {
        rawMatches.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
        if (m[0].length === 0) PUNCT_REGEX.lastIndex++;
      }
      if (rawMatches.length === 0) return { protectedText: text, tokens: [] };

      let result = "";
      let cursor = 0;
      const tokens = [];
      for (const span of rawMatches) {
        result += text.slice(cursor, span.start);
        const idx = tokens.length;
        const glueBefore = result.length > 0 && !/\s$/.test(result);
        result += (glueBefore ? " " : "") + `‡${idx}‡`;
        const nextChar = text[span.end];
        const glueAfter = !!nextChar && !/\s/.test(nextChar);
        if (glueAfter) result += " ";
        tokens.push({ text: span.text, glueBefore, glueAfter });
        cursor = span.end;
      }
      result += text.slice(cursor);
      return { protectedText: result, tokens };
    }

    function restorePunctuation(text, tokens) {
      return text.replace(/(\s*)‡\s*(\d+)\s*‡(\s*)/g, (m, before, idx, after) => {
        const tok = tokens[Number(idx)];
        if (tok === undefined) return m;
        if (typeof tok === "string") return `${before}${tok}${after}`;
        const keepBefore = tok.glueBefore ? "" : before;
        const keepAfter = tok.glueAfter ? "" : after;
        return `${keepBefore}${tok.text}${keepAfter}`;
      });
    }

    function tokenizeForSimilarity(text) {
      const stripped = text.replace(/#[A-Za-z0-9_\[\]]+/g, " ");
      return stripped.toLowerCase().match(/[a-zà-ÿ0-9']+/g) || [];
    }

    function textSimilarity(a, b) {
      const ta = new Set(tokenizeForSimilarity(a));
      const tb = new Set(tokenizeForSimilarity(b));
      if (ta.size === 0 || tb.size === 0) return 0;
      let inter = 0;
      for (const t of ta) if (tb.has(t)) inter += 1;
      return (2 * inter) / (ta.size + tb.size);
    }

    function findSimilarInMemory(original, memory, threshold = 0.45, limit = 3) {
      const key = original.trim();
      const results = [];
      for (const [memOriginal, data] of Object.entries(memory)) {
        if (memOriginal === key) continue; // exato já é tratado separado
        const score = textSimilarity(key, memOriginal);
        if (score >= threshold) results.push({ original: memOriginal, translation: data.translation, score });
      }
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, limit);
    }

    function splitIntoSentences(text) {
      const s = String(text || "");
      if (!s) return [];
      const codeSpans = matchAllCodes(s);
      const insideCode = (pos) => codeSpans.some((c) => pos >= c.start && pos < c.end);

      const parts = [];
      let start = 0;
      const re = /[.!?…]+(?=\s|$)/g;
      let m;
      while ((m = re.exec(s)) !== null) {
        const endPunct = m.index + m[0].length;
        if (insideCode(m.index)) continue;
        const piece = s.slice(start, endPunct).trim();
        if (piece) parts.push(piece);
        start = endPunct;
      }
      const rest = s.slice(start).trim();
      if (rest) parts.push(rest);
      return parts;
    }

    function groupSentencesIntoLines(sentences, lineCount) {
      const lines = [];
      let restantes = sentences.length;
      let linhasRestantes = lineCount;
      let i = 0;
      while (linhasRestantes > 0) {
        // quantas frases esta linha leva: divide o que sobrou pelas linhas
        // que faltam, arredondando pra cima (garante que não sobre frase)
        const levar = Math.max(1, Math.ceil(restantes / linhasRestantes));
        lines.push(sentences.slice(i, i + levar).join(" "));
        i += levar;
        restantes -= levar;
        linhasRestantes -= 1;
      }
      return lines;
    }

    // Quantas palavras cada linha do ORIGINAL tinha — é o "molde" usado
    // pelo wrapToLineCount pra repartir a tradução de um jeito que fique
    // parecido com o original não só no NÚMERO de linhas, mas também na
    // quantidade de palavra de CADA linha (uma linha curta no original vira
    // uma linha proporcionalmente curta na tradução, não um pedaço igual
    // das outras). Linha vazia no original (raro, mas existe) conta 0.
    function originalLineWordCounts(original) {
      return String(original || "")
        .split(/\r\n|\r|\n/)
        .map((line) => {
          const t = line.trim();
          return t ? t.split(/\s+/).length : 0;
        });
    }

    // Reparte as palavras da TRADUÇÃO (já sem quebra de linha, uma frase
    // corrida) proporcionalmente à distribuição de palavras das linhas do
    // ORIGINAL (`lineWordCounts`, uma entrada por linha). Ex: original com
    // "3 palavras / 7 palavras" nas 2 linhas -> a tradução tenta reservar
    // ~30%/~70% das SUAS palavras pra linha 1/linha 2, não 50/50. Cada linha
    // recebe pelo menos 1 palavra (exceto quando o original tinha aquela
    // linha vazia de verdade, aí a tradução também fica vazia ali).
    function wrapProportionalToOriginal(words, lineWordCounts) {
      const lineCount = lineWordCounts.length;
      const totalOriginalWords = lineWordCounts.reduce((a, b) => a + b, 0) || lineCount;
      const totalWords = words.length;
      const lines = [];
      let idx = 0;
      let cumulativeOriginal = 0;
      for (let i = 0; i < lineCount; i++) {
        cumulativeOriginal += lineWordCounts[i];
        const isLast = i === lineCount - 1;
        const remainingNonEmptyAfter = lineWordCounts.slice(i + 1).filter((c) => c > 0).length;
        let cutoff;
        if (lineWordCounts[i] === 0) {
          cutoff = idx; // original tinha linha vazia aqui -> tradução também fica
        } else {
          cutoff = isLast ? totalWords : Math.round((cumulativeOriginal / totalOriginalWords) * totalWords);
          cutoff = Math.max(cutoff, idx + 1); // nunca deixa a linha atual vazia (a menos que o original tenha)
        }
        cutoff = Math.min(cutoff, totalWords - remainingNonEmptyAfter); // reserva >=1 palavra pras próximas linhas não-vazias
        lines.push(words.slice(idx, cutoff).join(" "));
        idx = cutoff;
      }
      return lines.join("\n");
    }

    // `originalWordsPerLine` é opcional (array com a saída de
    // originalLineWordCounts) — quando fornecido, a repartição por palavra
    // segue a PROPORÇÃO de cada linha do original em vez de equilibrar por
    // tamanho médio de caractere (comportamento antigo, mantido como
    // fallback quando só temos o número de linhas, sem a forma delas).
    function wrapToLineCount(text, lineCount, originalWordsPerLine) {
      const clean = text.replace(/\s+/g, " ").trim();
      if (lineCount <= 1 || !clean) return clean;

      // PREFERÊNCIA 1: quebrar onde a frase termina.
      // No formato deste jogo, o original quase sempre traz uma frase por
      // linha ("Please be careful." / "Don't push or run!"). Quebrar por
      // contagem de caracteres ignorando isso produzia coisas como
      // "Por favor, tenha / cuidado. Não empurre nem corra!" — que cabe no
      // número de linhas certo, mas lê mal e não corresponde ao original.
      const frases = splitIntoSentences(clean);
      if (frases.length === lineCount) return frases.join("\n");

      const words = clean.split(" ");
      if (words.length < lineCount) return clean; // não tem palavra suficiente pra quebrar sem cortar

      // PREFERÊNCIA 2: com a forma linha-a-linha do original em mãos,
      // reparte por PROPORÇÃO de palavra (pedido explícito do usuário: além
      // do número de linhas bater, a quantidade de palavra em cada linha
      // precisa ficar parecida com a linha correspondente do original).
      if (Array.isArray(originalWordsPerLine) && originalWordsPerLine.length === lineCount) {
        return wrapProportionalToOriginal(words, originalWordsPerLine);
      }

      if (frases.length > lineCount) return groupSentencesIntoLines(frases, lineCount).join("\n");

      // PREFERÊNCIA 3 (fallback antigo, só quando não recebemos a forma do
      // original): equilíbrio por tamanho médio de caractere por linha.
      const targetPerLine = clean.length / lineCount;
      const lines = [];
      let current = "";
      let linesLeft = lineCount;

      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const candidate = current ? `${current} ${w}` : w;
        const wordsRemainingAfterThis = words.length - (i + 1);
        const mustKeepForRemainingLines = linesLeft - 1;
        if (
          linesLeft > 1 &&
          current &&
          candidate.length > targetPerLine &&
          wordsRemainingAfterThis >= mustKeepForRemainingLines
        ) {
          lines.push(current);
          current = w;
          linesLeft -= 1;
        } else {
          current = candidate;
        }
      }
      lines.push(current);
      return lines.join("\n");
    }

    function parseTwoColumnImport(text) {
      const lines = text.split(/\r\n|\r|\n/);
      const rows = [];
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const parts = line.includes("\t") ? line.split("\t") : line.split(",");
        const original = (parts[0] || "").trim().replace(/^"(.*)"$/, "$1");
        const translation = (parts.slice(1).join(parts[0].includes("\t") ? "\t" : ",") || "").trim().replace(/^"(.*)"$/, "$1");
        if (!original) continue;
        const lower = original.toLowerCase();
        if (rows.length === 0 && (lower === "termo" || lower === "term" || lower === "original")) continue; // cabeçalho óbvio
        rows.push({ original, translation });
      }
      return rows;
    }

    function parseRetryAfterMs(res) {
      try {
        const header = res && res.headers && res.headers.get ? res.headers.get("retry-after") : null;
        if (!header) return null;
        const asSeconds = Number(header);
        if (!Number.isNaN(asSeconds)) return Math.max(0, asSeconds * 1000);
        const asDate = Date.parse(header);
        if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
      } catch (e) {}
      return null;
    }

    function computeBackoffDelay(attempt, retryAfterMs) {
      if (typeof retryAfterMs === "number" && retryAfterMs > 0) {
        // 65s (não 30s): um retryDelay real vindo do servidor (Gemini manda
        // isso no corpo do erro 429 pra limites por minuto) é mais confiável
        // que qualquer teto arbitrário nosso — truncar isso fazia a gente
        // tentar de novo ANTES da cota liberar, e bater no limite outra vez.
        return Math.min(retryAfterMs, 65000) + Math.floor(Math.random() * 250);
      }
      const base = Math.min(1000 * Math.pow(2, attempt), 20000);
      return base + Math.floor(Math.random() * 400);
    }

    function createRateLimitGate() {
      return { until: 0 };
    }

    function noteRateLimited(gate, retryAfterMs) {
      if (!gate) return;
      const wait = Math.min(typeof retryAfterMs === "number" && retryAfterMs > 0 ? retryAfterMs : 5000, 65000);
      gate.until = Math.max(gate.until, Date.now() + wait);
    }

    async function waitForRateLimitGate(gate) {
      if (!gate) return;
      const delta = gate.until - Date.now();
      // O jitter é o detalhe que importa: sem ele os workers acordam todos
      // no mesmo milissegundo e recriam o pico que acabou de ser punido.
      if (delta > 0) await sleep(delta + Math.floor(Math.random() * 400));
    }

    const LLM_BATCH_SIZE = 20;

    function isLocalOpenAiEndpoint(settings) {
      return !!(settings && settings.llmProvider === "openai" && settings.openaiBaseUrl && settings.openaiBaseUrl.trim());
    }

    function llmBatchSizeFor(settings) {
      if (!settings || settings.engine !== "llm") return LLM_BATCH_SIZE;
      if (isLocalOpenAiEndpoint(settings)) {
        return Math.max(1, Math.min(50, Number(settings.openaiLocalBatchSize) || 10));
      }
      if (settings.llmProvider === "openai") return 30;
      return LLM_BATCH_SIZE;
    }

    function llmPacingFor(settingsOrProvider) {
      const settings = typeof settingsOrProvider === "string"
        ? { llmProvider: settingsOrProvider }
        : (settingsOrProvider || {});
      const provider = settings.llmProvider;

      if (provider === "google") {
        return { concurrency: 1, staggerMs: 0, paceMs: 1200, itemPaceMs: 1200 };
      }

      // Servidor local: paralelizar não acelera nada (a fila é a mesma
      // GPU/CPU) e ainda piora — várias requisições concorrentes disputam
      // memória e podem estourar o contexto ou derrubar o servidor. Uma de
      // cada vez, sem pausa artificial (não há cota externa a respeitar).
      if (isLocalOpenAiEndpoint(settings)) {
        // 1 era um padrão seguro, mas conservador demais pra quem subiu o
        // Ollama com OLLAMA_NUM_PARALLEL > 1: nesse caso ele processa vários
        // pedidos no mesmo lote de inferência e o ganho de throughput é
        // real. Quem não configurou nada continua em 1, que é o certo — aí
        // paralelizar só faz as requisições brigarem pela mesma fila.
        const n = Math.max(1, Math.min(8, Number(settings.openaiLocalConcurrency) || 1));
        return { concurrency: n, staggerMs: n > 1 ? 80 : 0, paceMs: 0, itemPaceMs: 0 };
      }

      // API oficial da OpenAI: os limites de requisição por minuto são bem
      // folgados já no tier pago inicial, e cada lote aqui carrega 30 linhas
      // — 4 requisições simultâneas aproveitam muito melhor o tempo de ida e
      // volta da rede sem chegar perto da cota. Se ainda assim bater 429, o
      // backoff exponencial (computeBackoffDelay) já segura a onda sozinho.
      if (provider === "openai") {
        return { concurrency: 4, staggerMs: 150, paceMs: 120, itemPaceMs: 150 };
      }

      return { concurrency: 2, staggerMs: 200, paceMs: 250, itemPaceMs: 200 };
    }

    function llmProviderLabel(provider) {
      return provider === "openai" ? "OpenAI" : provider === "google" ? "Google AI Studio" : "Anthropic";
    }

    function fewShotCountFor(settings) {
      if (!settings) return 3;
      const model = settings.llmModel || "";
      const isHaiku = settings.llmProvider === "anthropic" && /haiku/i.test(model);
      const isSmallOpenAi = settings.llmProvider === "openai" && isSmallOpenAiModel(model);
      return isHaiku || isSmallOpenAi ? 5 : 3;
    }

    function pickFewShotExamples(translationMemory, count = 3) {
      if (!translationMemory || typeof translationMemory !== "object") return [];
      return Object.entries(translationMemory)
        .filter(([original, entry]) => entry && entry.verified && entry.translation && entry.translation.trim() && original.trim().length >= 8 && original.length <= 140)
        .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
        .slice(0, count)
        .map(([original, entry]) => ({ original: original.trim(), translation: entry.translation.trim() }));
    }

    function filterGlossaryForTexts(properNouns, texts) {
      if (!properNouns || properNouns.length === 0) return [];
      const haystack = (Array.isArray(texts) ? texts.join("\n") : String(texts || "")).toLowerCase();
      if (!haystack) return [];
      return properNouns.filter((pn) => {
        const term = (pn.term || "").trim().toLowerCase();
        if (!term) return false;
        return haystack.includes(term);
      });
    }

    const FEW_SHOT_BASE = [
      { original: "Hey, you okay there?", translation: "Ei, você tá bem aí?" },        // registro informal
      { original: "But if we don't—", translation: "Mas se a gente não—" },            // corte tem que continuar cortado
      { original: "Understood, Instructor.", translation: "Entendido, Instrutor." },   // tratamento formal militar
      { original: "Hmph.", translation: "Hmpf." },                                     // interjeição não vira frase
    ];

    // Exemplos que atacam uma falha MEDIDA, não hipotética: 158 linhas de um
    // relatório de QA voltaram idênticas à entrada, sempre nestes três
    // formatos. Ficam separados do FEW_SHOT_BASE porque entram SEMPRE — a
    // memória do projeto não pode empurrá-los pra fora da lista, já que eles
    // não estão ali por tom, e sim pra impedir o passthrough.
    const FEW_SHOT_ANTI_PASSTHROUGH = [
      // gagueira: traduz E reproduz a hesitação na palavra em português
      { original: "W-Was that Allie?!", translation: "E-Era a Allie?!" },
      // caixa alta continua caixa alta, mas em português
      { original: "DOST THOU DESIRE THE POWER?", translation: "TU DESEJAS O PODER?" },
      // aspas se mantêm, o conteúdo é traduzido
      { original: "'Heed my call...Valimar!'", translation: "'Atenda ao meu chamado...Valimar!'" },
    ];

    function buildLlmSystemPrompt(properNouns, fewShotExamples, options = {}) {
      // hasMarkers: se a entrada REALMENTE contém marcador. Ver comentário
      // grande na regra condicional abaixo.
      const { hasMarkers = true } = options;

      const glossaryLines = (properNouns || [])
        .filter((p) => p.term && p.term.trim())
        .map((p) => `- "${p.term.trim()}" → ${p.translation && p.translation.trim() ? `"${p.translation.trim()}"` : "manter igual, não traduzir"}`)
        .join("\n");

      // exemplos da memória do projeto vêm primeiro (são os mais
      // específicos); os fixos completam quando a memória ainda é pequena
      // Ordem: anti-passthrough sempre (corrigem uma falha medida), depois a
      // memória do projeto (mais específica), depois os fixos de tom.
      const daMemoria = (fewShotExamples || []).filter((ex) => ex && ex.original && ex.translation);
      const usados = [...FEW_SHOT_ANTI_PASSTHROUGH];
      for (const ex of [...daMemoria, ...FEW_SHOT_BASE]) {
        if (usados.length >= 9) break;
        if (!usados.some((u) => u.original === ex.original)) usados.push(ex);
      }
      const exampleLines = usados.map((ex) => `- "${ex.original}" → "${ex.translation}"`).join("\n");

      return [
        'Você traduz diálogos do jogo "The Legend of Heroes: Trails of Cold Steel" do inglês para português do Brasil.',
        "Regras:",
        "- É um RPG de fantasia militar/escolar — mantenha o tom e o registro de fala (formal, informal, arrogante, tímido etc.) que o texto sugerir para quem está falando.",
        "- Preserve frases incompletas, cortadas ou com reticências exatamente como incompletas — não complete o pensamento por conta própria.",
        "- IDIOMA DE SAÍDA: responda SEMPRE em português do Brasil. Nunca em inglês, nunca em chinês, nunca em nenhum outro idioma — mesmo que o texto de entrada tenha nomes ou trechos estrangeiros.",
        "- NUNCA devolva a entrada sem traduzir. Gagueira com hífen (\"W-Was\", \"I-I\"), TEXTO EM MAIÚSCULAS e fala entre aspas são DIÁLOGO, não código: traduza normalmente e preserve a forma — a gagueira vira gagueira na palavra portuguesa, as maiúsculas continuam maiúsculas, as aspas continuam aspas.",

        // REGRA CONDICIONAL — corrige um bug de "priming" real.
        // Desde que os códigos das pontas passaram a ser arrancados antes do
        // envio (prepareForLlm), a maioria absoluta das requisições vai SEM
        // marcador nenhum. Continuar explicando "§0§" em detalhe, com exemplo
        // do certo e do errado, ensina o modelo pequeno a produzir "§" — e
        // ele passa a inventar marcador que ninguém pediu. Descrever um
        // símbolo em detalhe aumenta a probabilidade dele na saída.
        hasMarkers
          ? "- Marcadores no formato §0§, §1§ etc. são códigos técnicos do jogo — copie-os EXATAMENTE como aparecem, incluindo o § de ABERTURA e o § de FECHAMENTO. §0§ está certo; §0 sozinho está ERRADO. Nunca crie um marcador que não estava na entrada."
          : "- O texto NÃO contém códigos técnicos. Sua resposta deve ser apenas prosa em português: nenhum símbolo especial, nenhum §, nenhum #.",

        glossaryLines ? `Glossário de termos (use exatamente estas traduções quando o termo aparecer):\n${glossaryLines}` : "",
        exampleLines ? `Exemplos de tom e registro esperados:\n${exampleLines}` : "",

        // Exemplo NEGATIVO: modelo pequeno aprende melhor vendo o erro do
        // que só lendo a proibição.
        'Exemplo do que NÃO fazer:\n  entrada: "Wait!"\n  ERRADO:  "Claro! A tradução é: Espere!"\n  CERTO:   "Espere!"',

        // A restrição mais crítica fica POR ÚLTIMO, colada ao ponto de
        // geração — antes ela ficava no meio, com glossário e exemplos
        // depois, o que a empurrava pra longe de onde o modelo decide.
        "- RETORNE EXCLUSIVAMENTE A TRADUÇÃO CRUA. Sob nenhuma hipótese inclua saudações, confirmações, aspas ou texto extra. O seu output será injetado diretamente no código do jogo.",
      ].filter(Boolean).join("\n");
    }

    function buildLlmBatchSystemPrompt(properNouns, fewShotExamples, options = {}) {
      const base = buildLlmSystemPrompt(properNouns, fewShotExamples, options);
      return [
        base,
        '- Você vai receber um objeto JSON no formato {"items": ["texto 1", "texto 2", ...]}. Traduza CADA item da lista, um a um, mantendo a ordem.',
        '- Responda APENAS com um objeto JSON válido no formato {"translations": ["tradução 1", "tradução 2", ...]}, com exatamente o mesmo número de itens da entrada, na mesma ordem. Nenhum texto antes ou depois, sem markdown, sem ```json.',
        "- Cada item da lista é uma linha de diálogo INDEPENDENTE das outras — não junte, não resuma, não pule nenhuma, mesmo que pareçam repetidas ou sem contexto.",
        "- Se um item da lista de entrada vier vazio ou só com espaços, devolva ele também vazio na mesma posição — nunca remova nem pule um índice, mesmo que pareça inútil traduzir.",
        "- IDIOMA DE SAÍDA: todas as traduções em português do Brasil. Nunca em inglês, nunca em chinês, nunca em outro idioma.",
        "- RETORNE EXCLUSIVAMENTE O OBJETO JSON. Sob nenhuma hipótese inclua saudações, confirmações ou qualquer texto fora do JSON — o output é injetado direto no código do jogo, e texto extra quebra o processamento de TODO o lote.",
      ].join("\n");
    }

    function validateBatchTranslationsArray(arr, expectedLength) {
      if (!Array.isArray(arr)) throw new Error('resposta do lote sem a lista "translations" esperada');
      if (arr.length !== expectedLength) {
        throw new Error(`resposta do lote com ${arr.length} item(ns), esperava ${expectedLength}`);
      }
      return arr.map((t) => (typeof t === "string" ? t : String(t ?? "")));
    }

    function extractAnthropicToolInput(contentArray, toolName) {
      if (!Array.isArray(contentArray)) return null;
      const block = contentArray.find((b) => b && b.type === "tool_use" && (!toolName || b.name === toolName));
      return block ? block.input : null;
    }

    function parseBatchTranslationResponse(raw, expectedLength) {
      let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        throw new Error("resposta do lote não é um JSON válido");
      }
      const arr = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.translations) ? parsed.translations : null;
      return validateBatchTranslationsArray(arr, expectedLength);
    }

    function protectProperNouns(text, properNouns) {
      if (!properNouns || properNouns.length === 0) return { text, tokens: [] };
      const sorted = [...properNouns].filter((p) => p.term && p.term.trim()).sort((a, b) => b.term.length - a.term.length);
      if (sorted.length === 0) return { text, tokens: [] };

      // acha todas as ocorrências primeiro (termo mais longo tem prioridade,
      // sem sobrepor), só depois substitui de uma vez com espaçamento seguro
      // — mesmo princípio usado pra proteger os códigos do jogo: um marcador
      // colado sem espaço numa palavra ou pontuação vizinha (ex: "Rean's",
      // "Rean,") pode ser engolido/embaralhado pelo tradutor automático.
      const matches = [];
      for (const pn of sorted) {
        const escaped = pn.term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`\\b${escaped}\\b`, "gi");
        let m;
        while ((m = re.exec(text)) !== null) {
          const start = m.index;
          const end = start + m[0].length;
          const overlaps = matches.some((x) => start < x.end && end > x.start);
          if (!overlaps) {
            matches.push({ start, end, replacement: pn.translation && pn.translation.trim() ? pn.translation.trim() : m[0] });
          }
          if (m[0].length === 0) re.lastIndex += 1;
        }
      }
      if (matches.length === 0) return { text, tokens: [] };
      matches.sort((a, b) => a.start - b.start);

      let result = "";
      let cursor = 0;
      const tokens = [];
      for (const mtch of matches) {
        result += text.slice(cursor, mtch.start);
        const idx = tokens.length;
        // glueBefore/glueAfter: true quando o termo está colado ao texto
        // vizinho no ORIGINAL (sem espaço) — mesmo mecanismo do protectCodes/
        // restoreCodes (ver comentário lá): o espaço aqui embaixo é só pra
        // ajudar o tradutor estatístico a não engolir o marcador junto da
        // palavra/pontuação vizinha (ex: "Rean's", "Rean,"); sem isso a
        // tradução final voltava com espaço extra ("Rean 's" em vez de
        // "Rean's") que restoreProperNouns não desfazia.
        const glueBefore = result.length > 0 && !/\s$/.test(result);
        result += (glueBefore ? " " : "") + `¤${idx}¤`;
        const nextChar = text[mtch.end];
        const glueAfter = !!nextChar && !/\s/.test(nextChar);
        if (glueAfter) result += " ";
        tokens.push({ text: mtch.replacement, glueBefore, glueAfter });
        cursor = mtch.end;
      }
      result += text.slice(cursor);
      return { text: result, tokens };
    }

    function restoreProperNouns(text, tokens) {
      return text.replace(/(\s*)¤\s*(\d+)\s*¤(\s*)/g, (m, before, idx, after) => {
        const tok = tokens[Number(idx)];
        if (tok === undefined) return m;
        if (typeof tok === "string") return `${before}${tok}${after}`;
        const keepBefore = tok.glueBefore ? "" : before;
        const keepAfter = tok.glueAfter ? "" : after;
        return `${keepBefore}${tok.text}${keepAfter}`;
      });
    }

    const glossaryCompileCache = new WeakMap();

    // Achata espaço em branco pra comparação de glossário. O motivo é
    // concreto: wrapToLineCount reparte a tradução em linhas DEPOIS de ela
    // ficar pronta, e a quebra cai onde couber — inclusive no meio de um
    // termo do glossário ("Panzer\nSoldat", "Guerra dos Cem\nDias",
    // "Rean\nSchwarzer"). Comparar o texto cru contra "Panzer Soldat"
    // falhava sempre nesses casos, e como quase toda fala longa é
    // reparticionada, isso virou a maior fonte de aviso FALSO do QA.
    function flattenForGlossary(text) {
      return String(text == null ? "" : text).replace(/\s+/g, " ");
    }

    // Artigos que podem sumir/contrair na frente do termo. Em português a
    // preposição gruda no artigo o tempo todo (de+a=da, em+a=na, a+a=à), então
    // exigir "A Sociedade" literal reprova "ligado à Sociedade", que está
    // certíssimo. Só o corpo do termo importa pra checagem.
    const GLOSSARIO_ARTIGOS = new Set(["a", "o", "as", "os", "um", "uma"]);

    function escapeForRegex(s) {
      return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    // Regex do termo ESPERADO em português, tolerante às variações que a
    // língua cria sozinha:
    //  - artigo inicial vira opcional (contração, ver acima);
    //  - cada palavra aceita flexão de plural — mas NÃO tentando prever a
    //    regra certa (bug real: "(?:s|es)?" cobre plural regular do
    //    inglês, mas o plural do português é irregular pra várias
    //    terminações — "Filial" vira "Filiais" (-al -> -ais), não
    //    "Filials" nem "Filiales". Prever cada terminação irregular
    //    (-al/-ais, -el/-eis, -ão/-ões/-ães...) é retrabalho sem fim.
    //    Em vez disso, casa o RADICAL da palavra (as primeiras ~70% das
    //    letras) seguido de QUALQUER sufixo — "Fili" + qualquer coisa
    //    casa "Filial" e "Filiais" igualmente, sem saber gramática
    //    nenhuma. Palavra curta (<4 letras) demais pro radical fazer
    //    sentido cai de volta no sufixo simples;
    //  - o espaço entre palavras aceita qualquer espaço em branco.
    // É deliberadamente tolerante: este aviso existe pra pegar "o modelo
    // ignorou meu termo fixo", não pra corrigir concordância.
    function radicalDaPalavra(p) {
      if (p.length < 4) return escapeForRegex(p) + "(?:s|es)?";
      const tamanhoRadical = Math.max(3, Math.ceil(p.length * 0.7));
      return escapeForRegex(p.slice(0, tamanhoRadical)) + "[A-Za-zÀ-ÖØ-öø-ÿ]*";
    }

    function buildExpectedTermRegex(expected) {
      let palavras = expected.trim().split(/\s+/).filter(Boolean);
      if (palavras.length > 1 && GLOSSARIO_ARTIGOS.has(palavras[0].toLowerCase())) {
        palavras = palavras.slice(1);
      }
      if (palavras.length === 0) palavras = expected.trim().split(/\s+/).filter(Boolean);
      const corpo = palavras.map(radicalDaPalavra).join("\\s+");
      return new RegExp(corpo, "i");
    }

    function compileGlossary(properNouns) {
      if (!properNouns || properNouns.length === 0) return [];
      const cached = glossaryCompileCache.get(properNouns);
      if (cached) return cached;
      const compiled = [];
      for (const pn of properNouns) {
        const term = (pn.term || "").trim();
        const expected = (pn.translation || "").trim();
        if (!term || !expected) continue; // sem tradução fixa cadastrada, nada a checar
        const escaped = escapeForRegex(term);
        compiled.push({
          term,
          expected,
          re: new RegExp(`\\b${escaped}\\b`, "i"),
          expectedRe: buildExpectedTermRegex(expected),
        });
      }
      glossaryCompileCache.set(properNouns, compiled);
      return compiled;
    }

    function findGlossaryMismatches(original, translation, properNouns) {
      const compiled = compileGlossary(properNouns);
      if (compiled.length === 0) return [];
      // Achata ANTES de comparar: sem isso, todo termo de duas palavras que
      // caiu numa quebra de linha vira aviso falso (ver flattenForGlossary).
      const origPlano = flattenForGlossary(original);
      const tradPlano = flattenForGlossary(translation);
      const mismatches = [];
      for (const pn of compiled) {
        if (!pn.re.test(origPlano)) continue; // termo não aparece nesta linha
        // aceita o termo em português (com artigo contraído/plural)...
        const hasExpected = pn.expectedRe.test(tradPlano);
        // ...ou o termo em inglês mantido tal e qual (nome próprio que não
        // se traduz, tipo "Panzer Soldat")
        const hasOriginalTerm = pn.re.test(tradPlano);
        if (!hasExpected && !hasOriginalTerm) {
          mismatches.push({ term: pn.term, expected: pn.expected });
        }
      }
      return mismatches;
    }

    function countOccurrences(str, code) {
      let count = 0;
      let from = 0;
      while (true) {
        const i = str.indexOf(code, from);
        if (i === -1) break;
        count += 1;
        from = i + code.length;
      }
      return count;
    }

    function countOccurrencesByCode(codes) {
      const map = new Map();
      for (const c of codes) map.set(c, (map.get(c) || 0) + 1);
      return map;
    }

    function splitLeadingTrailingCodes(text) {
      const s = String(text || "");
      const matches = matchAllCodes(s);
      let lead = "";
      let cursor = 0;
      let i = 0;
      while (i < matches.length && matches[i].start === cursor) {
        lead += matches[i].text;
        cursor = matches[i].end;
        i += 1;
      }
      let trail = "";
      let end = s.length;
      let j = matches.length - 1;
      // j >= i evita contar duas vezes quando a fala inteira é só código
      while (j >= i && matches[j].end === end) {
        trail = matches[j].text + trail;
        end = matches[j].start;
        j -= 1;
      }
      return { lead, core: s.slice(cursor, end), trail };
    }

    function repairMissingCodes(original, translation) {
      const text = String(translation || "");
      const expectedCodes = extractCodes(String(original || ""));
      if (expectedCodes.length === 0) return { text, fixed: true, changed: false, unfixable: [] };

      const expected = countOccurrencesByCode(expectedCodes);
      const missing = [];
      for (const [code, n] of expected.entries()) {
        if (countOccurrences(text, code) < n) missing.push(code);
      }
      if (missing.length === 0) return { text, fixed: true, changed: false, unfixable: [] };

      const o = splitLeadingTrailingCodes(original);
      const t = splitLeadingTrailingCodes(text);
      // o miolo traduzido entra sem as pontas de código que ele porventura
      // ainda tenha (essas vêm do original, que é a fonte da verdade)
      const candidate = o.lead + t.core.trim() + o.trail;

      // Aprovação só sai se a SEQUÊNCIA de códigos bater exatamente. Isso
      // cobre de uma vez: código faltando, código sobrando (duplicado) e
      // código fora de ordem — os três são inaceitáveis pro jogo.
      const candidateCodes = extractCodes(candidate);
      if (candidateCodes.join("\u0000") !== expectedCodes.join("\u0000")) {
        return { text, fixed: false, changed: false, unfixable: missing };
      }
      return { text: candidate, fixed: true, changed: candidate !== text, unfixable: [] };
    }

    function canRepairMissingCodes(original, translation) {
      const r = repairMissingCodes(original, translation);
      return r.fixed && r.changed;
    }

    const NON_LATIN_SCRIPT_RE = /[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u30FF\uAC00-\uD7AF\u0400-\u04FF\u0600-\u06FF\u0590-\u05FF\u0E00-\u0E7F\u0900-\u097F]/;

    function findNonLatinChars(text) {
      const found = [];
      const seen = new Set();
      for (const ch of String(text || "")) {
        if (NON_LATIN_SCRIPT_RE.test(ch) && !seen.has(ch)) {
          seen.add(ch);
          found.push(ch);
        }
      }
      return found;
    }

    const NON_LATIN_MIN_CHARS = 2;

    const NON_LATIN_MIN_RATIO = 0.15;

    function nonLatinRatio(text) {
      const s = String(text || "").replace(/\s+/g, "");
      if (!s) return 0;
      let n = 0;
      for (const ch of s) if (NON_LATIN_SCRIPT_RE.test(ch)) n += 1;
      return n / s.length;
    }

    function isWrongScript(text) {
      const s = String(text || "");
      let total = 0;
      for (const ch of s.replace(/\s+/g, "")) if (NON_LATIN_SCRIPT_RE.test(ch)) total += 1;
      return total >= NON_LATIN_MIN_CHARS && nonLatinRatio(s) >= NON_LATIN_MIN_RATIO;
    }

    function describeChars(chars) {
      return chars.map((ch) => `${ch} (U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")})`).join(" ");
    }

    function migrateQaIgnored(saved) {
      if (!saved || typeof saved !== "object") return {};
      const out = {};
      for (const [ref, tipos] of Object.entries(saved)) {
        if (!tipos || typeof tipos !== "object") continue;
        const novo = {};
        for (const [tipo, val] of Object.entries(tipos)) {
          novo[tipo === "still-english" ? "wrong-language" : tipo] = val;
        }
        out[ref] = novo;
      }
      return out;
    }

    function makeTranslationFailedIssue() {
      return {
        severity: "critical",
        type: "translation-failed",
        detail: 'o motor de tradução falhou nesta linha depois de esgotar as tentativas — o texto original foi mantido pra não ficar em branco. Reenvie ao lote (ou use "Apagar críticos e refazer").',
      };
    }

    function checkEntryIssues(entry, translation, properNouns) {
      const text = (translation || "").trim();
      if (!text) return [];
      const issues = [];

      if (entry.codes.length > 0) {
        // conta OCORRÊNCIAS de cada código, não só presença — um `.includes()`
        // simples não pega o caso de um código que aparece 2x no original e
        // só 1x na tradução (comum em falas longas com mais de uma quebra/
        // troca de expressão do mesmo tipo). Auditoria 2.1.
        const missingOrShort = [];
        for (const [code, expectedCount] of countOccurrencesByCode(entry.codes).entries()) {
          const actualCount = countOccurrences(text, code);
          if (actualCount < expectedCount) {
            missingOrShort.push(expectedCount > 1 ? `${code} (${actualCount}/${expectedCount}x)` : code);
          }
        }
        if (missingOrShort.length > 0) {
          issues.push({
            severity: "critical",
            type: "missing-code",
            detail: `código(s) do jogo ausente(s) ou em quantidade menor na tradução: ${missingOrShort.join(" ")}`,
          });
        }
      }

      // Marcador de proteção que sobrou é sempre CRÍTICO: é texto que não
      // existe no roteiro e vai aparecer literalmente na tela do jogo.
      const leaked = findLeakedMarkers(text);
      if (leaked.length > 0) {
        issues.push({
          severity: "critical",
          type: "leaked-marker",
          detail: `sobrou marcador de proteção na tradução (${leaked.slice(0, 4).join(" ")}) — isso apareceria literalmente no jogo`,
        });
      }

      // Código inventado é tão grave quanto código perdido: manda o jogo
      // executar uma instrução que o roteiro original não tinha.
      const inventados = findInventedCodes(entry.original, text);
      if (inventados.length > 0) {
        issues.push({
          severity: "critical",
          type: "invented-code",
          detail: `código(s) de jogo que NÃO existem no original: ${inventados.slice(0, 4).join(" ")}`,
        });
      }

      if (entry.lineCount > 1) {
        const lc = text.split(/\r\n|\r|\n/).length;
        if (lc !== entry.lineCount) {
          issues.push({
            severity: "warning",
            type: "line-mismatch",
            detail: `original tem ${entry.lineCount} linha(s), tradução tem ${lc}`,
          });
        }
      }

      // IDIOMA ERRADO — um tipo só pra qualquer coisa que não seja
      // português. Antes eram dois avisos separados ("ainda em inglês" e
      // "outro idioma"), o que dividia o mesmo problema em duas listas e dois
      // botões. O que importa é uma pergunta só: a linha está em português?
      // Inglês, chinês ou russo são todos a mesma falha do ponto de vista de
      // quem revisa.
      //
      // A SEVERIDADE é que muda, conforme a força da evidência:
      //  - escrita não-latina (chinês, cirílico...) é CRÍTICA. Não existe
      //    hipótese de isso ser proposital num texto pt-BR, e gravar no jogo
      //    seria lixo garantido — então bloqueia a exportação.
      //  - inglês é AVISO. Pode ser proposital: nome próprio, sigla, "OK",
      //    grito. Bloquear a exportação nesses casos travaria o trabalho à
      //    toa; como aviso, dá pra usar "ignorar" linha a linha.
      const nonLatin = findNonLatinChars(text);
      const escritaErrada = isWrongScript(text);
      if (escritaErrada) {
        issues.push({
          severity: "critical",
          type: "wrong-language",
          detail: `a tradução está em outro idioma (${Math.round(nonLatinRatio(text) * 100)}% do texto fora do alfabeto latino: ${describeChars(nonLatin.slice(0, 4))}${nonLatin.length > 4 ? "..." : ""})`,
        });
      } else if (nonLatin.length > 0) {
        // Poucos caracteres estranhos no meio de um texto latino: pode ser
        // símbolo copiado por engano, resíduo de codificação do arquivo, ou
        // um caractere invisível. Vale revisar, mas NÃO é "a tradução está
        // em outro idioma" e não pode bloquear a exportação.
        issues.push({
          severity: "warning",
          type: "odd-chars",
          detail: `caractere(s) fora do alfabeto latino no meio do texto: ${describeChars(nonLatin.slice(0, 4))}${nonLatin.length > 4 ? "..." : ""}`,
        });
      }

      // Continua em INGLÊS — mesmo tipo "wrong-language", severidade aviso.
      //
      // A evidência mais forte aqui não é o idioma detectado, é a SEMELHANÇA
      // com o original. Tradução de verdade fica em ~0% de semelhança
      // ("Please be careful." -> "Por favor, tenha cuidado."); linha que
      // passou sem tradução fica em 100%. Separação limpa, e não depende de
      // reconhecer vocabulário — a versão anterior, que confiava só na
      // detecção de idioma, dava 10% de falso positivo em linha curta.
      //
      // Também resolve um empate: "Do not push or run!" tem "do", que existe
      // nas listas de palavras dos DOIS idiomas, então a detecção devolvia
      // "unknown" e a linha não traduzida escapava. Pela semelhança, é pega.
      if (entry.lang === "en" && !escritaErrada) {
        const sim = textSimilarity(entry.original, text);
        // praticamente intocada: evidência suficiente sozinha
        const quaseIdentica = sim >= 0.85;
        // parcialmente mexida: exige a detecção de idioma concordando
        const parecidaEDetectadaEn = sim >= 0.5 && detectLanguage(text) === "en";
        if (quaseIdentica || parecidaEDetectadaEn) {
          issues.push({
            severity: "warning",
            type: "wrong-language",
            detail: `a tradução ainda parece estar em inglês (${Math.round(sim * 100)}% igual ao original)`,
          });
        }
      }

      for (const m of findGlossaryMismatches(entry.original, text, properNouns)) {
        issues.push({
          severity: "warning",
          type: "glossary-mismatch",
          detail: `termo "${m.term}" tem tradução fixa "${m.expected}" cadastrada no glossário, mas não aparece na tradução`,
        });
      }

      return issues;
    }

    const QA_DIAG_AMOSTRAS_POR_TIPO = 12;

    const QA_DIAG_MAX_TEXTO = 300;

    function cortaTexto(s, max) {
      const t = String(s == null ? "" : s);
      return t.length > max ? t.slice(0, max) + "…[cortado]" : t;
    }

    function buildQaDiagnostic(qaResults, settings, extras) {
      const items = (qaResults && qaResults.items) || [];
      const info = extras || {};

      // --- contagens (completas, sobre TODOS os itens) ---
      const porTipo = {};
      const porSeveridade = { critical: 0, warning: 0 };
      const porArquivo = {};
      for (const it of items) {
        porArquivo[it.fileName] = (porArquivo[it.fileName] || 0) + 1;
        for (const iss of it.issues) {
          porTipo[iss.type] = (porTipo[iss.type] || 0) + 1;
          if (iss.severity === "critical") porSeveridade.critical += 1;
          else porSeveridade.warning += 1;
        }
      }

      // --- amostras (limitadas por tipo) ---
      const amostras = {};
      for (const it of items) {
        for (const iss of it.issues) {
          if (!amostras[iss.type]) amostras[iss.type] = [];
          if (amostras[iss.type].length >= QA_DIAG_AMOSTRAS_POR_TIPO) continue;
          amostras[iss.type].push({
            arquivo: it.fileName,
            celula: it.ref,
            original: cortaTexto(it.original, QA_DIAG_MAX_TEXTO),
            traducao: cortaTexto(it.translation, QA_DIAG_MAX_TEXTO),
            detalhe: iss.detail,
            verificadaPorHumano: !!it.verified,
            // dados que costumam explicar o problema sem precisar perguntar
            codigosNoOriginal: extractCodes(it.original),
            codigosNaTraducao: extractCodes(it.translation),
          });
        }
      }

      const s = settings || {};
      const ehLocal = !!(s.openaiBaseUrl && String(s.openaiBaseUrl).trim());

      return {
        comoUsar:
          "Log de diagnóstico do tradutor de Trails of Cold Steel (inglês -> português do Brasil). " +
          "Os textos passam por um pipeline que protege os códigos do jogo (#E[12], #M_4 etc.) antes de ir " +
          "pro modelo e os recoloca depois. Analise os padrões em 'amostras' junto com 'ambiente' e diga: " +
          "(a) qual a causa mais provável de cada tipo de problema, (b) se é configuração, prompt ou limitação " +
          "do modelo, e (c) o que mudar primeiro. 'contagens' vale sobre o TOTAL; 'amostras' é uma seleção " +
          "limitada por tipo, então use-a pra padrão, não pra proporção.",

        geradoEm: new Date().toISOString(),
        versaoRelatorio: 1,

        ambiente: {
          motor: s.engine || null,
          provedor: s.llmProvider || null,
          modelo: s.llmModel || null,
          servidorLocal: ehLocal,
          apiNativaOllama: ehLocal ? s.openaiUseOllamaNative !== false : false,
          numCtx: ehLocal ? Number(s.openaiNumCtx) || null : null,
          keepAlive: ehLocal ? s.openaiKeepAlive || null : null,
          linhasPorRequisicao: ehLocal ? Number(s.openaiLocalBatchSize) || null : null,
          requisicoesEmParalelo: ehLocal ? Number(s.openaiLocalConcurrency) || null : null,
          // a chave NUNCA sai daqui: este arquivo existe pra ser compartilhado
          chaveDeApi: "[removida do relatório]",
        },

        escopo: {
          alcance: (qaResults && qaResults.scope) || null,
          arquivosAnalisados: info.totalArquivos || null,
          linhasAnalisadas: info.totalLinhas || null,
          termosNoGlossario: info.totalGlossario || null,
        },

        contagens: {
          linhasComProblema: items.length,
          porSeveridade,
          porTipo,
          porArquivo: Object.fromEntries(
            Object.entries(porArquivo).sort((a, b) => b[1] - a[1]).slice(0, 20)
          ),
        },

        amostrasLimitadasA: QA_DIAG_AMOSTRAS_POR_TIPO,
        amostras,
      };
    }

    function runQualityCheck(scopedDocs, properNouns) {
      const results = [];
      for (const d of scopedDocs) {
        const qaIgnored = d.qaIgnored || {};
        for (const e of d.entries) {
          if (d.ignored[e.ref]) continue;
          const translation = d.translations[e.ref];
          if (!translation || !translation.trim()) continue;
          let issues = checkEntryIssues(e, translation, properNouns);
          if (d.translationFailed && d.translationFailed[e.ref]) {
            issues = [makeTranslationFailedIssue(), ...issues];
          }
          // Nota do revisor de coerência (IA) — mesma lógica da cópia deste
          // arquivo no HTML (ver comentário lá): não vem de checkEntryIssues
          // porque não é propriedade do TEXTO, é um veredito já computado e
          // guardado em d.coherenceReview.
          const review = d.coherenceReview && d.coherenceReview[e.ref];
          if (review) {
            const coherenceIssue = makeCoherenceIssue(review);
            if (coherenceIssue) issues = [coherenceIssue, ...issues];
          }

          // LINHA VERIFICADA só mostra CRÍTICO.
          // Marcar como verificada é o ato de dizer "eu li e aprovo esta
          // tradução" — o que já inclui ter visto os avisos. Continuar
          // repetindo "parece estar em inglês" ou "termo do glossário
          // diferente" numa linha que a pessoa aprovou de propósito só
          // enche a lista e faz o QA perder credibilidade: quando quase
          // tudo é aviso, ninguém olha os avisos.
          //
          // Crítico é diferente e NÃO some: código do jogo ausente ou
          // tradução em outro idioma podem quebrar o jogo, e isso não é
          // questão de gosto que uma aprovação humana resolva — pode ter
          // sido aprovado sem a pessoa perceber o código faltando.
          if (d.verified[e.ref]) {
            issues = issues.filter((iss) => iss.severity === "critical");
          }

          // "ignorar" só se aplica a avisos — crítico (código do jogo
          // ausente/alterado) NUNCA é filtrado aqui, mesmo que alguém tenha
          // deixado uma entrada velha em qaIgnored (defesa extra: a UI já
          // não oferece o botão de ignorar pra severidade crítica).
          const ignoredForRef = qaIgnored[e.ref];
          if (ignoredForRef) {
            issues = issues.filter((iss) => iss.severity === "critical" || !ignoredForRef[iss.type]);
          }
          if (issues.length > 0) {
            results.push({
              docId: d.id,
              fileName: d.fileName,
              project: d.project,
              ref: e.ref,
              location: e.location,
              original: e.original,
              translation,
              verified: !!d.verified[e.ref],
              issues,
            });
          }
        }
      }
      return results;
    }

    function selectBulkApprovableEntries(doc, properNouns) {
      const toApprove = [];
      let skippedCritical = 0;
      let alreadyVerified = 0;
      let stillEmpty = 0;
      for (const e of doc.entries) {
        if (doc.ignored[e.ref]) continue;
        if (doc.verified[e.ref]) { alreadyVerified += 1; continue; }
        const text = (doc.translations[e.ref] || "").trim();
        if (!text) { stillEmpty += 1; continue; }
        const issues = checkEntryIssues(e, text, properNouns);
        if (doc.translationFailed && doc.translationFailed[e.ref]) issues.push(makeTranslationFailedIssue());
        if (issues.some((iss) => iss.severity === "critical")) { skippedCritical += 1; continue; }
        toApprove.push({ ref: e.ref, original: e.original, text });
      }
      return { toApprove, skippedCritical, alreadyVerified, stillEmpty };
    }

    const memoryKey = (text) => text.trim();

    function entryMatchesFilter(doc, e, filter, q, originalOccurrenceCounts) {
      const isDone = (doc.translations[e.ref] || "").trim().length > 0;
      const isIgnored = !!doc.ignored[e.ref];
      const isVerified = !!doc.verified[e.ref];
      if (isIgnored && filter !== "ignored" && filter !== "all") return false;
      if (filter === "pending" && (isDone || isVerified)) return false;
      if (filter === "done" && (!isDone || isVerified)) return false;
      if (filter === "ignored" && !isIgnored) return false;
      if (filter === "verified" && !isVerified) return false;
      if (filter === "lang-en" && (e.lang !== "en" || isVerified)) return false;
      if (filter === "dup-unverified") {
        if (isVerified) return false;
        const count = (originalOccurrenceCounts && originalOccurrenceCounts[memoryKey(e.original)]) || 0;
        if (count <= 2) return false;
      }
      if (q) {
        const hay = `${e.ref} ${e.location} ${e.original}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }

    function bytesToBase64(bytes) {
      let bin = "";
      for (const b of bytes) bin += String.fromCharCode(b);
      return btoa(bin);
    }

    function base64ToBytes(b64) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }

    async function deriveAesKey(passphrase, saltBytes, usages) {
      const enc = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
      return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: saltBytes, iterations: 100000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        usages
      );
    }

    async function encryptApiKey(plainKey, passphrase) {
      const enc = new TextEncoder();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveAesKey(passphrase, salt, ["encrypt"]);
      const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plainKey));
      return {
        cipher: bytesToBase64(new Uint8Array(cipherBuf)),
        iv: bytesToBase64(iv),
        salt: bytesToBase64(salt),
      };
    }

    async function decryptApiKey(encrypted, passphrase) {
      const salt = base64ToBytes(encrypted.salt);
      const iv = base64ToBytes(encrypted.iv);
      const cipher = base64ToBytes(encrypted.cipher);
      const key = await deriveAesKey(passphrase, salt, ["decrypt"]);
      const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
      return new TextDecoder().decode(plainBuf);
    }

    async function sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }

    async function withExportProgress(targets, iteratee, onProgress, delayMs = 0) {
      let done = 0;
      for (const target of targets) {
        await iteratee(target);
        done += 1;
        onProgress(done, targets.length);
        if (delayMs) await sleep(delayMs);
      }
    }

    async function translateViaLibreTranslate(protectedText, settings) {
      const endpoint = (settings.ltEndpoint || "http://localhost:5000/translate").trim();
      const body = {
        q: protectedText,
        source: settings.ltSource || "en",
        target: settings.ltTarget || "pt",
        format: "text",
      };
      if (settings.ltApiKey && settings.ltApiKey.trim()) body.api_key = settings.ltApiKey.trim();

      let res;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (e) {
        throw new Error(
          `não consegui falar com o LibreTranslate em ${endpoint} — confira se o servidor local está rodando (verifique a URL nas configurações)`
        );
      }
      let data = null;
      try { data = await res.json(); } catch (e) {}
      if (!res.ok) {
        const detail = data && data.error ? data.error : "";
        const err = new Error(`LibreTranslate HTTP ${res.status}${detail ? ": " + detail : ""}`);
        // mesma paridade de retry/backoff que os outros motores já têm
        // (MyMemory/Anthropic/OpenAI/Google): 429 (limite de taxa, se o
        // servidor tiver alguma proteção configurada) e 5xx (instância local
        // sobrecarregada, reiniciando, ou o worker de tradução travou por um
        // instante) merecem nova tentativa com espera, em vez de desistir na
        // hora — igual já acontecia pros outros três motores.
        err.status = res.status;
        err.retryable = res.status === 429 || res.status >= 500;
        err.retryAfterMs = parseRetryAfterMs(res);
        throw err;
      }
      const translated = data && data.translatedText;
      // além de checar o tipo, checa se não veio vazio — um LibreTranslate
      // instável às vezes devolve HTTP 200 com translatedText:"" (modelo
      // engasgou, timeout parcial etc.); sem essa checagem isso silenciosamente
      // vira uma tradução "em branco" salva no lugar de um erro que dispararia
      // nova tentativa.
      if (typeof translated !== "string" || !translated.trim()) {
        throw new Error("resposta vazia/inválida do LibreTranslate");
      }
      return translated;
    }

    async function translateViaMyMemory(protectedText) {
      if (utf8Length(protectedText) > 480) {
        throw new Error("texto longo demais para o MyMemory (limite ~480 bytes) — troque para LibreTranslate nas configurações");
      }
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(protectedText)}&langpair=en|pt-BR&mt=1`;
      let res;
      try {
        res = await fetch(url);
      } catch (e) {
        throw new Error("falha de rede/CORS ao chamar o MyMemory (verifique sua internet)");
      }
      if (!res.ok) {
        const err = new Error(
          res.status === 429 ? "limite de requisições do MyMemory atingido (HTTP 429)" : `HTTP ${res.status} do MyMemory`
        );
        err.status = res.status;
        err.retryable = res.status === 429 || res.status >= 500;
        err.retryAfterMs = parseRetryAfterMs(res);
        throw err;
      }
      const data = await res.json();
      if (data && typeof data.responseStatus !== "undefined" && Number(data.responseStatus) !== 200) {
        throw new Error(`MyMemory recusou: ${data.responseDetails || data.responseStatus}`);
      }
      const translated = data && data.responseData && data.responseData.translatedText;
      if (typeof translated !== "string" || !translated) {
        throw new Error("resposta inválida do MyMemory");
      }
      const upper = translated.toUpperCase();
      if (upper.includes("MYMEMORY WARNING") || upper.includes("QUERY LENGTH LIMIT") || (upper.includes("INVALID") && upper.includes("LANGUAGE"))) {
        throw new Error(`MyMemory recusou: ${translated.slice(0, 120)}`);
      }
      return translated;
    }

    function buildAnthropicSystemBlocks(systemPrompt) {
      return [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }];
    }

    function anthropicThinkingConfig(model) {
      if (!/haiku/i.test(model || "")) return {};
      return { thinking: { type: "enabled", budget_tokens: 1024 } };
    }

    function extractAnthropicText(contentArray) {
      if (!Array.isArray(contentArray)) return null;
      const block = contentArray.find((b) => b && b.type === "text" && typeof b.text === "string");
      return block ? block.text : null;
    }

    async function translateViaAnthropic(protectedText, settings, systemPrompt) {
      const model = settings.llmModel || "claude-sonnet-5";
      const thinkingConfig = anthropicThinkingConfig(model);
      const usingThinking = !!thinkingConfig.thinking;
      let res;
      try {
        res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": settings.llmApiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model,
            // com thinking ligado, budget_tokens precisa ficar ABAIXO de
            // max_tokens — sobra de 512 tokens de resposta é de sobra pra
            // uma linha de diálogo curta.
            max_tokens: usingThinking ? thinkingConfig.thinking.budget_tokens + 512 : 1024,
            // temperature 0 é ótimo pros outros modelos (reduz invenção),
            // mas a API REJEITA esse campo quando thinking está ligado.
            ...(usingThinking ? {} : { temperature: 0 }),
            ...thinkingConfig,
            system: buildAnthropicSystemBlocks(systemPrompt),
            messages: [{ role: "user", content: protectedText }],
          }),
        });
      } catch (e) {
        throw new Error("falha de rede ao chamar a API da Anthropic (verifique sua internet)");
      }
      if (!res.ok) {
        let detail = "";
        try { const errBody = await res.json(); detail = (errBody && errBody.error && errBody.error.message) || ""; } catch (e) {}
        const err = new Error(
          res.status === 401
            ? "chave de API da Anthropic inválida ou não autorizada"
            : res.status === 429
            ? "limite de requisições/cota da Anthropic atingido"
            : `Anthropic HTTP ${res.status}${detail ? ": " + detail.slice(0, 150) : ""}`
        );
        err.status = res.status;
        err.retryable = res.status === 429 || res.status >= 500;
        err.retryAfterMs = parseRetryAfterMs(res);
        throw err;
      }
      const data = await res.json();
      const translated = data && extractAnthropicText(data.content);
      if (typeof translated !== "string" || !translated.trim()) throw new Error("resposta vazia/inválida da Anthropic");
      return translated.trim();
    }

    function isOpenAiReasoningModel(model) {
      const m = (model || "").trim().toLowerCase();
      if (!m) return false;
      // gpt-5, gpt-5.1, gpt-5-mini, gpt-5-nano... (cuidado: gpt-4o NÃO entra)
      if (/^gpt-5/.test(m)) return true;
      // série "o": o1, o1-mini, o3, o3-mini, o4-mini...
      if (/^o[134](-|$)/.test(m)) return true;
      return false;
    }

    function openAiReasoningEffortFor(model) {
      const m = (model || "").trim().toLowerCase();
      if (/^gpt-5\.(\d+)/.test(m)) return "none";
      if (/^gpt-5/.test(m)) return "minimal";
      if (/^o[134](-|$)/.test(m)) return "low";
      return null;
    }

    function isSmallOpenAiModel(model) {
      return /(mini|nano|small|tiny|1b|3b|4b|7b|8b)/i.test(model || "");
    }

    function hashStringToKey(str) {
      let h = 5381;
      const s = String(str || "");
      for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
      }
      return h.toString(36);
    }

    // Chave curta pra saber se a TRADUÇÃO de uma linha mudou desde a última
    // vez que o revisor de coerência (IA) avaliou ela. Reaproveita o mesmo
    // hash barato de cima — não precisa ser criptográfico, só precisa
    // detectar "o texto é outro agora", que é o suficiente pra decidir se
    // vale a pena pagar de novo por uma revisão que já existe e continua
    // válida (ver collectReviewableEntries).
    function reviewTextHash(translation) {
      return hashStringToKey(translation);
    }

    const OPENAI_CACHE_SHARDS = 4;

    const openAiCacheShardState = { cursor: 0 };

    function nextOpenAiCacheShard() {
      const shard = openAiCacheShardState.cursor % OPENAI_CACHE_SHARDS;
      openAiCacheShardState.cursor = (openAiCacheShardState.cursor + 1) % OPENAI_CACHE_SHARDS;
      return shard;
    }

    function openAiPromptCacheKey(systemPrompt, shard) {
      return `tlohcs3-${hashStringToKey(systemPrompt)}-${shard}`;
    }

    function retryAttemptOf(settings) {
      const n = Number(settings && settings.retryAttempt);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }

    function seedForAttempt(settings) {
      return 7 + retryAttemptOf(settings) * 1013;
    }

    function temperatureForAttempt(settings) {
      return retryAttemptOf(settings) === 0 ? 0 : 0.4;
    }

    function buildOpenAiTuning(settings, systemPrompt, maxOutputTokens, shardHint) {
      const model = (settings.llmModel || "gpt-4o-mini").trim();
      const isCustomEndpoint = !!(settings.openaiBaseUrl && settings.openaiBaseUrl.trim());
      // Servidor local (Ollama/LM Studio/vLLM...) fala o dialeto do gpt-4o
      // clássico. Mandar campo novo (reasoning_effort, service_tier,
      // prompt_cache_key) pra ele é arriscar rejeição da requisição inteira
      // por payload desconhecido — então tudo que é específico da API oficial
      // fica de fora quando o endpoint é customizado.
      if (isCustomEndpoint) {
        // Esta branch só roda quando a API nativa do Ollama está DESLIGADA
        // (LM Studio, vLLM, etc). num_ctx e keep_alive foram removidos daqui
        // porque NENHUM endpoint compatível-OpenAI os aplica — o shim
        // descarta campo fora do padrão. Mantê-los sugeria um controle que
        // não existe. Quem precisa deles usa a API nativa (checkbox nas
        // configurações), onde eles funcionam de verdade.
        return {
          max_tokens: maxOutputTokens,
          temperature: temperatureForAttempt(settings),
          seed: seedForAttempt(settings), // este o shim de compatibilidade respeita
        };
      }

      const reasoning = isOpenAiReasoningModel(model);
      const tuning = {};

      // (1) nome certo do campo de teto de saída
      if (reasoning) tuning.max_completion_tokens = maxOutputTokens;
      else tuning.max_tokens = maxOutputTokens;

      // (2) temperature 0 reduz invenção nos modelos clássicos, mas é
      // REJEITADA nos de raciocínio — nesses o determinismo vem do
      // reasoning_effort baixo + do schema estrito de saída.
      if (!reasoning) {
        tuning.temperature = 0;
        // seed: pedido de determinismo "best effort" da OpenAI. Não é
        // garantia, mas faz duas execuções do mesmo texto tenderem à mesma
        // tradução — importante aqui porque o mesmo diálogo aparece em
        // arquivos diferentes do projeto, e tradução divergente entre eles é
        // justamente o que o glossário/memória existem pra evitar.
        tuning.seed = 7;
      } else {
        const effort = settings.openaiReasoningEffort && settings.openaiReasoningEffort !== "auto"
          ? settings.openaiReasoningEffort
          : openAiReasoningEffortFor(model);
        if (effort) tuning.reasoning_effort = effort;
      }

      // (3) roteamento pro cache de prompt (ver comentário acima)
      if (systemPrompt) {
        const shard = typeof shardHint === "number" && shardHint >= 0
          ? shardHint % OPENAI_CACHE_SHARDS
          : nextOpenAiCacheShard();
        tuning.prompt_cache_key = openAiPromptCacheKey(systemPrompt, shard);
      }

      // (4) service_tier: "priority" paga mais caro por latência bem menor e
      // mais previsível; "flex" é o contrário (mais barato, mais lento, pode
      // ficar indisponível em pico). "auto" = não manda o campo, deixa a
      // OpenAI decidir — é o padrão, pra não mudar a fatura de ninguém sem
      // a pessoa pedir.
      const tier = settings.openaiServiceTier;
      if (tier === "priority" || tier === "flex") tuning.service_tier = tier;

      return tuning;
    }

    function isOllamaNativeEnabled(settings) {
      return isLocalOpenAiEndpoint(settings) && settings.openaiUseOllamaNative !== false;
    }

    function ollamaNativeUrl(baseUrl) {
      const u = String(baseUrl || "").trim();
      if (!u) return "";
      if (/\/api\/chat\/?$/.test(u)) return u; // já é nativa
      return u.replace(/\/v1\/chat\/completions\/?$/, "/api/chat").replace(/\/v1\/?$/, "/api/chat");
    }

    function ollamaBatchSchema(qtdItens) {
      return {
        type: "object",
        properties: {
          translations: {
            type: "array",
            items: { type: "string" },
            minItems: qtdItens,
            maxItems: qtdItens,
          },
        },
        required: ["translations"],
      };
    }

    // Mesma ideia de ollamaBatchSchema, pro formato do revisor de coerência
    // (nota + explicação por item). Ver comentário completo na cópia deste
    // arquivo no HTML — resumo: sem isso, o caminho do Ollama local só
    // pedia JSON por instrução em texto, e um modelo pequeno local ocasionalmente
    // devolvia algo que não fechava como JSON válido.
    function ollamaReviewSchema(qtdItens) {
      return {
        type: "object",
        properties: {
          reviews: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "integer" },
                nota: { type: "integer" },
                explicacao: { type: "string" },
              },
              required: ["id", "nota", "explicacao"],
            },
            minItems: qtdItens,
            maxItems: qtdItens,
          },
        },
        required: ["reviews"],
      };
    }

    const OLLAMA_JSON_PREFILL = '{"translations": [';
    const OLLAMA_REVIEWS_JSON_PREFILL = '{"reviews": [';

    function buildOllamaNativeBody(settings, systemPrompt, userContent, maxOutputTokens, wantJson, batchSize, kind = "translations") {
      const numCtx = Number(settings.openaiNumCtx) || 8192;
      const prefill = kind === "reviews" ? OLLAMA_REVIEWS_JSON_PREFILL : OLLAMA_JSON_PREFILL;
      const schema = kind === "reviews" ? ollamaReviewSchema : ollamaBatchSchema;

      // Teto de sanidade: a saída precisa CABER no contexto junto com o
      // prompt. Com lote de 20 a fórmula pedia 6400 tokens contra 8192 de
      // contexto, sobrando quase nada pro prompt + glossário + diálogos — e
      // quando não cabe o Ollama TRUNCA EM SILÊNCIO, devolvendo um JSON
      // cortado no meio que falha no parse por um motivo que a mensagem de
      // erro não revelava.
      const numPredict = Math.min(maxOutputTokens, Math.floor(numCtx * 0.6));

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ];

      // PREFILL: o /api/chat aceita uma mensagem "assistant" no fim, e o
      // modelo CONTINUA aquele texto em vez de começar do zero. Como a
      // resposta já começa dentro do JSON, não existe espaço físico pro
      // "Claro! Aqui está a tradução:" — é a defesa mais eficaz contra
      // tagarelice, bem mais confiável que pedir por instrução.
      if (wantJson) messages.push({ role: "assistant", content: prefill });

      return {
        model: (settings.llmModel || "").trim() || "qwen2.5",
        messages,
        stream: false,
        ...(wantJson && batchSize > 0 ? { format: schema(batchSize) } : wantJson ? { format: "json" } : {}),
        // Aqui, sim, o Ollama respeita.
        keep_alive: settings.openaiKeepAlive || "30m",
        options: {
          temperature: temperatureForAttempt(settings),
          num_ctx: numCtx,
          num_predict: numPredict,
          // determinismo na 1ª tentativa; semente diferente nas seguintes,
          // senão o retry devolve byte por byte o mesmo erro (ver
          // retryAttemptOf).
          seed: seedForAttempt(settings),
          // O parâmetro que mais evita resposta degenerada em modelo 7B
          // quantizado: com temperature 0 ele entra em loop com facilidade
          // ("...não não não não"). Não custa qualidade em tradução.
          repeat_penalty: 1.1,
          // explícito pra não herdar valor estranho do Modelfile do modelo
          top_p: 1,
          // corta qualquer tagarelice depois do payload
          stop: wantJson ? ["```"] : ["\n\n"],
        },
      };
    }

    function extractOllamaNativeText(data) {
      if (!data) return null;
      const msg = data.message;
      if (msg && typeof msg.content === "string" && msg.content.trim()) return msg.content;
      // Modelos de raciocínio (qwen3, deepseek-r1) separam o pensamento em
      // `message.thinking` e podem devolver `content` vazio. Sem este ramo, o
      // usuário receberia "resposta vazia/inválida", que não diz o que fazer.
      // Qwen 2.5 não faz isso — é defesa pra quando o modelo for trocado.
      if (msg && typeof msg.thinking === "string" && msg.thinking.trim()) {
        throw new Error(
          "o modelo respondeu só com raciocínio interno e nenhum texto final — " +
          "use um modelo sem 'thinking' (ex.: qwen2.5) ou desligue esse modo"
        );
      }
      if (typeof data.response === "string" && data.response.trim()) return data.response; // /api/generate
      return null;
    }

    async function callOllamaNative(settings, systemPrompt, userContent, maxOutputTokens, wantJson, batchSize) {
      const url = ollamaNativeUrl(settings.openaiBaseUrl);
      let res;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildOllamaNativeBody(settings, systemPrompt, userContent, maxOutputTokens, wantJson, batchSize)),
        });
      } catch (e) {
        // Vale lembrar: o Ollama não manda cabeçalho CORS por padrão, e o
        // navegador bloqueia a chamada ANTES de ela sair — o sintoma é
        // exatamente este "falha de rede". Se o servidor está rodando e
        // mesmo assim cai aqui, o caminho é subir o Ollama com
        // OLLAMA_ORIGINS="*" (seguro: ele só escuta em localhost).
        throw new Error(
          `falha de rede ao chamar ${url} — verifique se o Ollama está rodando e, ` +
          `se estiver, se ele foi iniciado com OLLAMA_ORIGINS="*" (o navegador exige isso)`
        );
      }
      if (!res.ok) {
        let detail = "";
        try { const b = await res.json(); detail = (b && (b.error || b.message)) || ""; } catch (e) {}
        const err = new Error(`Ollama HTTP ${res.status}${detail ? ": " + String(detail).slice(0, 150) : ""}`);
        err.status = res.status;
        err.retryable = res.status === 429 || res.status >= 500;
        err.retryAfterMs = parseRetryAfterMs(res);
        throw err;
      }
      const data = await res.json();

      // done_reason "length" = a geração foi CORTADA pelo teto de tokens.
      // Sem tratar aqui, isso virava um JSON truncado e o erro que chegava ao
      // usuário era "resposta do lote com N itens, esperava M" — que não diz
      // nada sobre a causa real. Não é retryable: repetir com a mesma
      // configuração corta exatamente no mesmo lugar.
      if (data && data.done_reason === "length") {
        const err = new Error(
          "a resposta do modelo foi cortada por falta de espaço no contexto. " +
          "Reduza \"Linhas por requisição\" ou aumente o num_ctx nas configurações."
        );
        err.retryable = false;
        throw err;
      }

      let text = extractOllamaNativeText(data);
      if (typeof text !== "string" || !text.trim()) throw new Error("resposta vazia/inválida do Ollama");

      // Recompõe o prefill: o modelo devolve só a CONTINUAÇÃO do que foi
      // pré-preenchido, então o começo do JSON precisa voltar na frente.
      // Alguns servidores repetem o prefill na resposta — por isso a
      // checagem antes de concatenar, pra não duplicar.
      if (wantJson) {
        const t = text.trimStart();
        if (!t.startsWith(OLLAMA_JSON_PREFILL) && !t.startsWith("{")) {
          text = OLLAMA_JSON_PREFILL + text;
        }
      }
      return text.trim();
    }

    async function translateViaOpenAI(protectedText, settings, systemPrompt) {
      const isCustomEndpoint = !!(settings.openaiBaseUrl && settings.openaiBaseUrl.trim());
      const endpoint = isCustomEndpoint ? settings.openaiBaseUrl.trim() : "https://api.openai.com/v1/chat/completions";
      let res;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.llmApiKey}`,
          },
          body: JSON.stringify({
            model: settings.llmModel || "gpt-4o-mini",
            // temperature 0 / max_tokens vs max_completion_tokens /
            // reasoning_effort / seed / prompt_cache_key / service_tier /
            // num_ctx do Ollama — tudo isso agora vem de buildOpenAiTuning,
            // que é o ÚNICO lugar que sabe o que cada modelo e cada tipo de
            // endpoint aceitam (ver comentário longo lá em cima). O teto de
            // 1024 tokens de saída continua o mesmo de antes: corta rápido uma
            // resposta que degenerar em repetição.
            ...buildOpenAiTuning(settings, systemPrompt, 1024),
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: protectedText },
            ],
          }),
        });
      } catch (e) {
        throw new Error(`falha de rede ao chamar ${endpoint} (verifique se o servidor está rodando e a URL está certa)`);
      }
      if (!res.ok) {
        let detail = "";
        try { const errBody = await res.json(); detail = (errBody && errBody.error && errBody.error.message) || ""; } catch (e) {}
        const err = new Error(
          res.status === 401
            ? "chave de API da OpenAI inválida ou não autorizada"
            : res.status === 429
            ? "limite de requisições/cota da OpenAI atingido"
            : `OpenAI HTTP ${res.status}${detail ? ": " + detail.slice(0, 150) : ""}`
        );
        err.status = res.status;
        err.retryable = res.status === 429 || res.status >= 500;
        err.retryAfterMs = parseRetryAfterMs(res);
        throw err;
      }
      const data = await res.json();
      const translated = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (typeof translated !== "string" || !translated.trim()) throw new Error("resposta vazia/inválida da OpenAI");
      return translated.trim();
    }

    const GOOGLE_SAFETY_SETTINGS = [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ];

    function googleThinkingConfig(model) {
      const isProModel = /-pro\b/i.test(model);
      return isProModel ? {} : { thinkingConfig: { thinkingBudget: 0 } };
    }

    function parseGoogleQuotaError(errBody) {
      const details = (errBody && errBody.error && Array.isArray(errBody.error.details)) ? errBody.error.details : [];
      let retryAfterMs = null;
      let isDailyQuota = false;
      for (const d of details) {
        if (d && d["@type"] === "type.googleapis.com/google.rpc.RetryInfo" && typeof d.retryDelay === "string") {
          const m = d.retryDelay.match(/^([\d.]+)s$/);
          if (m) retryAfterMs = Math.round(parseFloat(m[1]) * 1000);
        }
        if (d && d["@type"] === "type.googleapis.com/google.rpc.QuotaFailure" && Array.isArray(d.violations)) {
          for (const v of d.violations) {
            if (v && typeof v.quotaId === "string" && /PerDay/i.test(v.quotaId)) isDailyQuota = true;
          }
        }
      }
      return { retryAfterMs, isDailyQuota };
    }

    async function translateViaGoogle(protectedText, settings, systemPrompt) {
      const model = settings.llmModel || "gemini-2.5-flash";
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      let res;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": settings.llmApiKey,
          },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: protectedText }] }],
            safetySettings: GOOGLE_SAFETY_SETTINGS,
            // temperature 0: mesmo raciocínio do motor OpenAI — tradução de
            // código de jogo precisa seguir regras rígidas, não "criar".
            // maxOutputTokens: mesmo teto de segurança do motor Anthropic/
            // OpenAI, pra uma resposta degenerada não rodar solta.
            generationConfig: { temperature: 0, maxOutputTokens: 1024, ...googleThinkingConfig(model) },
          }),
        });
      } catch (e) {
        throw new Error("falha de rede ao chamar a API do Google AI Studio (verifique sua internet)");
      }
      if (!res.ok) {
        let detail = "";
        let errBody = null;
        try { errBody = await res.json(); detail = (errBody && errBody.error && errBody.error.message) || ""; } catch (e) {}
        // quotaInfo só importa em 429: lê o retryDelay real e detecta cota
        // diária esgotada (ver comentário de parseGoogleQuotaError acima).
        const quotaInfo = res.status === 429 ? parseGoogleQuotaError(errBody) : { retryAfterMs: null, isDailyQuota: false };
        const err = new Error(
          res.status === 400 || res.status === 403
            ? "chave de API do Google AI Studio inválida ou não autorizada"
            : res.status === 429
            ? (quotaInfo.isDailyQuota
                ? "cota DIÁRIA do Google AI Studio esgotada para este modelo — só libera de novo à meia-noite (horário do Pacífico/EUA). Troque de modelo (ex: gemini-2.5-flash-lite), use outra chave, ou volte mais tarde."
                : `limite de requisições/cota do Google AI Studio atingido${quotaInfo.retryAfterMs ? ` — aguardando ~${Math.ceil(quotaInfo.retryAfterMs / 1000)}s antes de tentar de novo` : ""}`)
            : `Google AI Studio HTTP ${res.status}${detail ? ": " + detail.slice(0, 150) : ""}`
        );
        err.status = res.status;
        // cota DIÁRIA não se resolve tentando de novo na mesma sessão — evita
        // queimar as tentativas de retry (e bater na cota outra vez) à toa.
        err.retryable = (res.status === 429 && !quotaInfo.isDailyQuota) || res.status >= 500;
        err.retryAfterMs = quotaInfo.retryAfterMs || parseRetryAfterMs(res);
        throw err;
      }
      const data = await res.json();
      const parts = data && Array.isArray(data.candidates) && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
      const translated = Array.isArray(parts) ? parts.map((p) => p && p.text).filter((t) => typeof t === "string").join("") : "";
      if (!translated.trim()) {
        const blockReason = data && data.promptFeedback && data.promptFeedback.blockReason;
        throw new Error(blockReason ? `resposta bloqueada pelo Google AI Studio (${blockReason})` : "resposta vazia/inválida do Google AI Studio");
      }
      return translated.trim();
    }

    const enforceCompileCache = new WeakMap();

    function compileEnforceableGlossary(properNouns) {
      if (!properNouns || properNouns.length === 0) return [];
      const cached = enforceCompileCache.get(properNouns);
      if (cached) return cached;
      const compiled = [];
      for (const pn of properNouns) {
        const term = (pn.term || "").trim();
        const fixed = (pn.translation || "").trim();
        if (!term || !fixed) continue;
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        compiled.push({
          fixed,
          fixedLower: fixed.toLowerCase(),
          test: new RegExp(`\\b${escaped}\\b`, "i"),
          all: new RegExp(`\\b${escaped}\\b`, "gi"),
        });
      }
      enforceCompileCache.set(properNouns, compiled);
      return compiled;
    }

    function enforceFixedGlossaryTerms(text, properNouns) {
      let result = text;
      for (const pn of compileEnforceableGlossary(properNouns)) {
        if (pn.test.test(result) && !result.toLowerCase().includes(pn.fixedLower)) {
          result = result.replace(pn.all, pn.fixed);
        }
      }
      return result;
    }

    async function translateViaLLM(flatOriginal, settings, properNouns, translationMemory) {
      if (!settings.llmApiKey || !settings.llmApiKey.trim()) {
        throw new Error("chave de API não configurada — adicione ela nas configurações do motor LLM");
      }
      // Códigos das PONTAS saem antes de enviar e voltam depois, sem passar
      // pelo modelo (ver prepareForLlm). Só o miolo vira marcador.
      const prep = prepareForLlm(flatOriginal);
      if (prep.nothingToTranslate) return flatOriginal; // linha só com código: nada a traduzir
      const protectedText = prep.protectedText;
      // servidor local: manda só os termos que aparecem NESTE texto
      const promptGlossary = isLocalOpenAiEndpoint(settings)
        ? filterGlossaryForTexts(properNouns, [flatOriginal])
        : properNouns;
      const systemPrompt = buildLlmSystemPrompt(
        promptGlossary,
        pickFewShotExamples(translationMemory, fewShotCountFor(settings)),
        // só explica marcador se esta linha realmente tiver algum
        { hasMarkers: prep.tokens.length > 0 }
      );
      const translated =
        isOllamaNativeEnabled(settings)
          ? await callOllamaNative(settings, systemPrompt, protectedText, 1024, false)
          : settings.llmProvider === "openai"
          ? await translateViaOpenAI(protectedText, settings, systemPrompt)
          : settings.llmProvider === "google"
          ? await translateViaGoogle(protectedText, settings, systemPrompt)
          : await translateViaAnthropic(protectedText, settings, systemPrompt);
      // Ordem importa: reforça o glossário ENQUANTO os códigos ainda são
      // marcadores "§0§" (ver comentário longo em enforceFixedGlossaryTerms).
      const enforced = enforceFixedGlossaryTerms(translated, properNouns);
      const montado = reassembleFromLlm(prep, enforced);

      // Idioma errado é a ÚNICA coisa que não dá pra salvar — não existe
      // como aproveitar uma resposta em chinês. Vira nova tentativa.
      if (isWrongScript(montado)) {
        const err = new Error("resposta descartada: veio em outro idioma");
        err.retryable = true;
        throw err;
      }

      // O resto (marcador órfão, código inventado) é RUÍDO removível: a
      // gente sabe pelo original o que deveria estar ali. Limpar devolve uma
      // tradução aproveitável — descartar deixaria a linha em inglês no jogo,
      // que é um resultado pior.
      return sanitizeTranslation(flatOriginal, montado);
    }

    async function translateBatchViaAnthropic(protectedTexts, settings, systemPrompt) {
      const model = settings.llmModel || "claude-sonnet-5";
      const thinkingConfig = anthropicThinkingConfig(model);
      const usingThinking = !!thinkingConfig.thinking;
      const baseMaxTokens = Math.min(8192, 400 + protectedTexts.length * 300);
      let res;
      try {
        res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": settings.llmApiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model,
            // ver o comentário do motivo em translateViaAnthropic: com
            // thinking ligado, max_tokens precisa ficar ACIMA do
            // budget_tokens — usa o maior dos dois com folga.
            max_tokens: usingThinking ? Math.max(baseMaxTokens, thinkingConfig.thinking.budget_tokens + 512) : baseMaxTokens,
            ...(usingThinking ? {} : { temperature: 0 }),
            ...thinkingConfig,
            system: buildAnthropicSystemBlocks(systemPrompt),
            messages: [{ role: "user", content: JSON.stringify({ items: protectedTexts }) }],
            // tool use FORÇADO (auditoria 1.2): em vez de só pedir "responda
            // com este JSON" por instrução em texto (o único mecanismo que a
            // Anthropic tinha aqui, diferente do OpenAI/Google que já usam
            // response_format/responseSchema estrito), obriga a resposta a
            // vir como input de uma chamada de ferramenta com schema
            // validado pela própria API — elimina de vez a classe de erro
            // "o modelo respondeu com uma frase solta antes do JSON".
            tools: [{
              name: "submit_translations",
              description: "Envia as traduções na mesma ordem e quantidade dos itens recebidos em items.",
              input_schema: {
                type: "object",
                properties: {
                  translations: { type: "array", items: { type: "string" } },
                },
                required: ["translations"],
              },
            }],
            tool_choice: { type: "tool", name: "submit_translations" },
          }),
        });
      } catch (e) {
        throw new Error("falha de rede ao chamar a API da Anthropic (verifique sua internet)");
      }
      if (!res.ok) {
        let detail = "";
        try { const errBody = await res.json(); detail = (errBody && errBody.error && errBody.error.message) || ""; } catch (e) {}
        const err = new Error(
          res.status === 401
            ? "chave de API da Anthropic inválida ou não autorizada"
            : res.status === 429
            ? "limite de requisições/cota da Anthropic atingido"
            : `Anthropic HTTP ${res.status}${detail ? ": " + detail.slice(0, 150) : ""}`
        );
        err.status = res.status;
        err.retryable = res.status === 429 || res.status >= 500;
        err.retryAfterMs = parseRetryAfterMs(res);
        throw err;
      }
      const data = await res.json();
      const toolInput = data && extractAnthropicToolInput(data.content, "submit_translations");
      if (!toolInput) throw new Error("resposta vazia/inválida da Anthropic (sem chamada de ferramenta)");
      return validateBatchTranslationsArray(toolInput.translations, protectedTexts.length);
    }

    async function translateBatchViaOpenAI(protectedTexts, settings, systemPrompt, shardHint) {
      const isCustomEndpoint = !!(settings.openaiBaseUrl && settings.openaiBaseUrl.trim());
      const endpoint = isCustomEndpoint ? settings.openaiBaseUrl.trim() : "https://api.openai.com/v1/chat/completions";
      let res;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.llmApiKey}`,
          },
          body: JSON.stringify({
            model: settings.llmModel || "gpt-4o-mini",
            // mesma fórmula do lote da Anthropic pro teto de saída: cresce com
            // o tamanho do lote, mas nunca passa de 8192. buildOpenAiTuning
            // decide o NOME do campo (max_tokens vs max_completion_tokens) e o
            // resto da afinação por modelo/endpoint.
            ...buildOpenAiTuning(settings, systemPrompt, Math.min(8192, 400 + protectedTexts.length * 300), shardHint),
            // json_schema com strict:true (só no endpoint oficial) trava o
            // formato de saída mais do que o json_object simples — reduz os
            // lotes que caem no fallback item-a-item por JSON malformado.
            // Endpoint customizado (Ollama/LM Studio etc.) mantém o
            // json_object de antes: nem todo servidor local reconhece o
            // campo json_schema, e arriscar rejeitar a requisição inteira é
            // pior do que simplesmente não travar o formato tão forte.
            response_format: isCustomEndpoint
              ? { type: "json_object" }
              : {
                  type: "json_schema",
                  json_schema: {
                    name: "batch_translations",
                    strict: true,
                    schema: {
                      type: "object",
                      properties: { translations: { type: "array", items: { type: "string" } } },
                      required: ["translations"],
                      additionalProperties: false,
                    },
                  },
                },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: JSON.stringify({ items: protectedTexts }) },
            ],
          }),
        });
      } catch (e) {
        throw new Error(`falha de rede ao chamar ${endpoint} (verifique se o servidor está rodando e a URL está certa)`);
      }
      if (!res.ok) {
        let detail = "";
        try { const errBody = await res.json(); detail = (errBody && errBody.error && errBody.error.message) || ""; } catch (e) {}
        const err = new Error(
          res.status === 401
            ? "chave de API da OpenAI inválida ou não autorizada"
            : res.status === 429
            ? "limite de requisições/cota da OpenAI atingido"
            : `OpenAI HTTP ${res.status}${detail ? ": " + detail.slice(0, 150) : ""}`
        );
        err.status = res.status;
        err.retryable = res.status === 429 || res.status >= 500;
        err.retryAfterMs = parseRetryAfterMs(res);
        throw err;
      }
      const data = await res.json();
      const raw = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (typeof raw !== "string" || !raw.trim()) throw new Error("resposta vazia/inválida da OpenAI");
      return parseBatchTranslationResponse(raw, protectedTexts.length);
    }

    async function translateBatchViaOllamaNative(protectedTexts, settings, systemPrompt) {
      // mesma fórmula de teto de saída dos outros motores, e o MESMO
      // parseBatchTranslationResponse — inclusive a validação de contagem,
      // que é o que faz um lote desalinhado cair no fallback item a item em
      // vez de gravar tradução na linha errada.
      const raw = await callOllamaNative(
        settings,
        systemPrompt,
        JSON.stringify({ items: protectedTexts }),
        Math.min(8192, 400 + protectedTexts.length * 300),
        true,
        protectedTexts.length // alimenta o minItems/maxItems do schema
      );
      return parseBatchTranslationResponse(raw, protectedTexts.length);
    }

    async function translateBatchViaGoogle(protectedTexts, settings, systemPrompt) {
      const model = settings.llmModel || "gemini-2.5-flash";
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      let res;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": settings.llmApiKey,
          },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: JSON.stringify({ items: protectedTexts }) }] }],
            safetySettings: GOOGLE_SAFETY_SETTINGS,
            // responseMimeType "application/json": obriga o Gemini a devolver
            // JSON válido (mesmo papel do response_format do motor OpenAI),
            // reduz bastante a chance da resposta do lote vir malformada.
            // maxOutputTokens: mesma fórmula proporcional ao lote usada nos
            // outros dois provedores.
            // responseSchema: além do mimeType, trava a FORMA exata do JSON
            // esperado (mesmo objetivo do json_schema estrito do motor
            // OpenAI) — reduz ainda mais a chance de vir campo faltando ou
            // tipo errado.
            generationConfig: {
              temperature: 0,
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: { translations: { type: "ARRAY", items: { type: "STRING" } } },
                required: ["translations"],
              },
              maxOutputTokens: Math.min(8192, 400 + protectedTexts.length * 300),
              ...googleThinkingConfig(model),
            },
          }),
        });
      } catch (e) {
        throw new Error("falha de rede ao chamar a API do Google AI Studio (verifique sua internet)");
      }
      if (!res.ok) {
        let detail = "";
        let errBody = null;
        try { errBody = await res.json(); detail = (errBody && errBody.error && errBody.error.message) || ""; } catch (e) {}
        // quotaInfo só importa em 429: lê o retryDelay real e detecta cota
        // diária esgotada (ver comentário de parseGoogleQuotaError acima).
        const quotaInfo = res.status === 429 ? parseGoogleQuotaError(errBody) : { retryAfterMs: null, isDailyQuota: false };
        const err = new Error(
          res.status === 400 || res.status === 403
            ? "chave de API do Google AI Studio inválida ou não autorizada"
            : res.status === 429
            ? (quotaInfo.isDailyQuota
                ? "cota DIÁRIA do Google AI Studio esgotada para este modelo — só libera de novo à meia-noite (horário do Pacífico/EUA). Troque de modelo (ex: gemini-2.5-flash-lite), use outra chave, ou volte mais tarde."
                : `limite de requisições/cota do Google AI Studio atingido${quotaInfo.retryAfterMs ? ` — aguardando ~${Math.ceil(quotaInfo.retryAfterMs / 1000)}s antes de tentar de novo` : ""}`)
            : `Google AI Studio HTTP ${res.status}${detail ? ": " + detail.slice(0, 150) : ""}`
        );
        err.status = res.status;
        // cota DIÁRIA não se resolve tentando de novo na mesma sessão — evita
        // queimar as tentativas de retry (e bater na cota outra vez) à toa.
        err.retryable = (res.status === 429 && !quotaInfo.isDailyQuota) || res.status >= 500;
        err.retryAfterMs = quotaInfo.retryAfterMs || parseRetryAfterMs(res);
        throw err;
      }
      const data = await res.json();
      const parts = data && Array.isArray(data.candidates) && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
      const raw = Array.isArray(parts) ? parts.map((p) => p && p.text).filter((t) => typeof t === "string").join("") : "";
      if (!raw.trim()) throw new Error("resposta vazia/inválida do Google AI Studio");
      return parseBatchTranslationResponse(raw, protectedTexts.length);
    }

    async function translateBatchViaLLM(originals, settings, properNouns, translationMemory, shardHint) {
      if (!settings.llmApiKey || !settings.llmApiKey.trim()) {
        throw new Error("chave de API não configurada — adicione ela nas configurações do motor LLM");
      }
      const flatOriginals = originals.map((o) => o.replace(/\r\n|\r|\n/g, " "));
      const preps = flatOriginals.map((o) => prepareForLlm(o));
      const protectedTexts = preps.map((p) => p.protectedText);
      // servidor local: só os termos presentes NESTE lote (ver
      // filterGlossaryForTexts). enforceFixedGlossaryTerms mais abaixo
      // continua usando a lista completa, então nada se perde.
      const promptGlossary = isLocalOpenAiEndpoint(settings)
        ? filterGlossaryForTexts(properNouns, originals)
        : properNouns;
      const systemPrompt = buildLlmBatchSystemPrompt(
        promptGlossary,
        pickFewShotExamples(translationMemory, fewShotCountFor(settings)),
        // basta UM item do lote ter marcador pra a regra fazer sentido
        { hasMarkers: preps.some((p) => p.tokens.length > 0) }
      );

      const translatedRaw =
        isOllamaNativeEnabled(settings)
          ? await translateBatchViaOllamaNative(protectedTexts, settings, systemPrompt)
          : settings.llmProvider === "openai"
          ? await translateBatchViaOpenAI(protectedTexts, settings, systemPrompt, shardHint)
          : settings.llmProvider === "google"
          ? await translateBatchViaGoogle(protectedTexts, settings, systemPrompt)
          : await translateBatchViaAnthropic(protectedTexts, settings, systemPrompt);

      return translatedRaw.map((t, i) => {
        // linha que é só código não foi traduzida: devolve como estava
        if (preps[i].nothingToTranslate) return originals[i];

        // mesma ordem do caminho item a item: enforce primeiro, remonta depois
        const montado = reassembleFromLlm(preps[i], enforceFixedGlossaryTerms(t, properNouns));

        // Idioma errado invalida o LOTE de propósito: ele é repetido e, se
        // insistir, cai no caminho item a item onde cada linha é reavaliada
        // sozinha. É o único caso sem salvação.
        if (isWrongScript(montado)) {
          const err = new Error(`item ${i + 1} do lote veio em outro idioma`);
          err.retryable = true;
          throw err;
        }

        // Marcador órfão e código inventado são limpos em vez de descartados
        // — descartar deixaria a linha sair em inglês no jogo.
        const limpo = sanitizeTranslation(flatOriginals[i], montado);
        const lineCount = originals[i].split(/\r\n|\r|\n/).length;
        return lineCount > 1 ? wrapToLineCount(limpo, lineCount, originalLineWordCounts(originals[i])) : limpo;
      });
    }

    async function translateBatchWithRetry(originals, settings, properNouns, translationMemory, retries = 2, shardHint) {
      let lastErr;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          // shardHint constante entre as tentativas: é o que faz a
          // retentativa reaproveitar o prefixo já quente (auditoria #2 B5).
          return await translateBatchViaLLM(originals, settings, properNouns, translationMemory, shardHint);
        } catch (e) {
          lastErr = e;
          // auditoria 1.1: erro EXPLICITAMENTE marcado como não-recuperável
          // (chave inválida, cota diária esgotada etc.) não se resolve
          // tentando de novo — falha rápido em vez de gastar 2-3 tentativas
          // inúteis (e mais tempo até o usuário ver o erro de verdade).
          // `retryable === false` é distinto de `undefined` (que continua
          // usando o backoff genérico de antes).
          if (e && e.retryable === false) throw e;
          if (attempt < retries) {
            const delay = e && e.retryable ? computeBackoffDelay(attempt, e.retryAfterMs) : 700 * (attempt + 1);
            await sleep(delay);
          }
        }
      }
      throw lastErr;
    }

    async function translateTextOnce(original, settings, properNouns, translationMemory) {
      // conta as linhas do original ANTES de mexer em qualquer coisa, e manda
      // pro tradutor um texto de uma linha só (mais confiável) — a quebra de
      // linha é reaplicada depois, por tamanho de palavra, sem cortar nada.
      const lineCount = original.split(/\r\n|\r|\n/).length;
      const flatOriginal = original.replace(/\r\n|\r|\n/g, " ");

      if (settings.engine === "llm") {
        // LLM entende contexto, então o glossário de termos vai como
        // instrução no prompt (não como marcador de posição) — fica mais
        // natural mesmo quando a frase flexiona o termo ao redor dele.
        const restored = await translateViaLLM(flatOriginal, settings, properNouns, translationMemory);
        return lineCount > 1 ? wrapToLineCount(restored, lineCount, originalLineWordCounts(original)) : restored;
      }

      // Auditoria 2.4: códigos do jogo são protegidos PRIMEIRO — mais
      // defensivo que a ordem anterior (nomes próprios antes de códigos),
      // porque garante que o regex de nomes próprios nunca roda sobre texto
      // que ainda tem sintaxe de código de controle crua (#E[12] etc.),
      // eliminando de vez qualquer possibilidade futura de um termo do
      // glossário coincidir parcialmente com um código novo. O restore
      // desfaz na ordem EXATAMENTE inversa (pontuação -> nomes -> códigos).
      const { protectedText: codeProtected, tokens: codeTokens } = protectCodes(flatOriginal);
      const { text: nounProtected, tokens: nounTokens } = protectProperNouns(codeProtected, properNouns);
      // punctProtected só acrescenta a proteção de "(" ")" "..." "…" (‡N‡)
      // por cima, sem se misturar com códigos (§N§) nem nomes (¤N¤)
      const { protectedText: punctProtected, tokens: punctTokens } = protectPunctuation(nounProtected);
      const translatedRaw =
        settings.engine === "mymemory"
          ? await translateViaMyMemory(punctProtected)
          : await translateViaLibreTranslate(punctProtected, settings);
      let restored = restorePunctuation(translatedRaw, punctTokens);
      restored = restoreProperNouns(restored, nounTokens);
      restored = restoreCodes(restored, codeTokens);
      return lineCount > 1 ? wrapToLineCount(restored, lineCount, originalLineWordCounts(original)) : restored;
    }

    async function translateText(original, settings, properNouns, translationMemory, retries = 3) {
      let lastErr;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await translateTextOnce(original, settings, properNouns, translationMemory);
        } catch (e) {
          lastErr = e;
          // auditoria 1.1: mesmo raciocínio de translateBatchWithRetry — não
          // insiste em erro que o próprio motor já disse que não vai se
          // resolver tentando de novo.
          if (e && e.retryable === false) throw e;
          if (attempt < retries) {
            const delay = e && e.retryable ? computeBackoffDelay(attempt, e.retryAfterMs) : 700 * (attempt + 1);
            await sleep(delay);
          }
        }
      }
      throw lastErr;
    }

// Mesma lógica de parseWorkbook() do app.html, só que recebendo o
// módulo XLSX (SheetJS) por parâmetro em vez de depender da variável
// global `XLSX` que só existe no navegador (carregada via <script> no
// app.html). Use: parseWorkbookEntries(XLSX.read(buffer), XLSX)
//
// Nota: chegou a existir aqui uma extração do nome de personagem do OP29
// ("Criar personagem"), removida a pedido do usuário — são nomes próprios,
// ele não vai alterá-los, então não fazem sentido como card de tradução.
// O que ficou: cada entry carrega o OP Code de origem (`opCode`) e um
// rótulo pronto pra exibir (`opLabel`, ex. "OP39: Diálogo — nome do
// interlocutor"), lido de SCENE_OP_LABELS (a mesma tabela do Editor de
// Cenas), pra deixar claro no card QUAL instrução do jogo gerou aquele
// texto sem precisar abrir o Editor de Cenas em separado.
    const DIALOG_OP_CODE = 39;
    const OP_CODE_COL = 1;
    function parseWorkbookEntries(workbook, XLSX) {
      const sheetName = workbook.SheetNames[0];
      const ws = workbook.Sheets[sheetName];
      if (!ws) return { sheetName, entries: [] };

      const cellKeys = Object.keys(ws).filter((k) => k[0] !== "!");
      const byRow = new Map();
      for (const key of cellKeys) {
        const addr = XLSX.utils.decode_cell(key);
        if (!byRow.has(addr.r)) byRow.set(addr.r, []);
        byRow.get(addr.r).push({ c: addr.c, v: ws[key].v, ref: key });
      }
      const rowIndices = Array.from(byRow.keys()).sort((a, b) => a - b);

      let header = null;
      let currentLocation = null;
      const entries = [];
      let idCounter = 0;

      for (const r of rowIndices) {
        const cells = byRow.get(r).sort((a, b) => a.c - b.c);
        const colA = cells.find((c) => c.c === 0);

        if (colA && colA.v === "Location") {
          header = new Map();
          for (const cell of cells) {
            if (cell.v !== null && cell.v !== undefined && cell.v !== "") {
              header.set(cell.c, cell.v);
            }
          }
        } else if (header && colA && typeof colA.v === "number") {
          currentLocation = colA.v;
          const opCodeCell = cells.find((c) => c.c === OP_CODE_COL);
          const opCode = opCodeCell ? opCodeCell.v : null;
          const isDialogOp = !!opCodeCell && opCodeCell.v === DIALOG_OP_CODE;

          for (const cell of cells) {
            const t = header.get(cell.c);
            if (cell.v === null || cell.v === undefined || cell.v === "") continue;

            const byType = t === "dialog"; // tipo "dialog" sempre entra, seja qual for o OP Code
            const byOpCode = isDialogOp && (t === "dialog" || t === "string"); // OP 39 pega dialog OU string
            if (!byType && !byOpCode) continue;

            idCounter += 1;
            const original = String(cell.v);
            const friendlyLabel = typeof opCode === "number" ? sceneOpLabel(opCode) : null;
            entries.push({
              id: idCounter,
              ref: cell.ref,
              row: r + 1,
              col: cell.c,
              type: t,
              location: currentLocation,
              original,
              lineCount: original.split(/\r\n|\r|\n/).length,
              lang: detectLanguage(original),
              codes: extractCodes(original),
              opCode,
              opLabel: typeof opCode === "number" ? `OP${opCode}${friendlyLabel ? `: ${friendlyLabel}` : ""}` : null,
            });
          }
        }
      }

      return { sheetName, entries };
    }

// ---------------------------------------------------------------------------
// Projetos e arquivos abertos — funções puras extraídas da auditoria de
// "Projetos e arquivos abertos": nome de projeto sem duplicar por causa de
// maiúscula/espaço, filtro de docs por projeto (pra escopar "todos" de
// verdade ao projeto ativo em vez de à sessão inteira), detecção de arquivo
// já aberto, e validação do .json de Colaboração.
// ---------------------------------------------------------------------------

// Resolve o nome de projeto que deve ser USADO de fato: se já existe um
// projeto conhecido igual ignorando maiúscula/minúscula e espaço nas
// pontas, devolve a grafia JÁ EXISTENTE (não cria "cs3" novo quando "CS3"
// já existe) — sem isso, digitar o mesmo projeto de duas formas diferentes
// fragmentava o progresso salvo silenciosamente. Devolve null se, depois do
// trim, não sobrar nome nenhum.
function resolveProjectName(inputName, knownProjects) {
  const trimmed = String(inputName == null ? "" : inputName).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const existing = (knownProjects || []).find((p) => String(p).trim().toLowerCase() === lower);
  return existing || trimmed;
}

// Filtra docs pelo projeto — usado pra escopar operações "todos" (busca,
// tradução em lote, QA, exportar, progresso geral) ao projeto ATIVO, em vez
// de a todo doc aberto na sessão (que podia misturar dois jogos diferentes
// abertos ao mesmo tempo).
function docsInProject(docs, project) {
  return (docs || []).filter((d) => d.project === project);
}

// true se já existe um doc aberto com o MESMO projeto + nome de arquivo —
// usado pra não deixar o mesmo arquivo virar dois cartões independentes na
// sidebar (cada um brigando pela mesma chave de progresso salvo).
function isDuplicateOpenFile(docs, project, fileName) {
  return (docs || []).some((d) => d.project === project && d.fileName === fileName);
}

// Formato da chave de progresso salvo no IndexedDB: "cs3progress:{projeto}:
// {arquivo}". Projeto nunca tem ":" na prática (fica antes do primeiro ":"),
// arquivo pode ter (por segurança, pega o resto inteiro).
const PROGRESS_STORAGE_PREFIX = "cs3progress:";
function parseProgressStorageKey(key) {
  if (typeof key !== "string" || !key.startsWith(PROGRESS_STORAGE_PREFIX)) return null;
  const rest = key.slice(PROGRESS_STORAGE_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep === -1) return null;
  const project = rest.slice(0, sep);
  const fileName = rest.slice(sep + 1);
  if (!project || !fileName) return null;
  return { project, fileName };
}

// Valida um .json antes de mesclar na Colaboração: confere que é REALMENTE
// um export deste app (kind + docs array), não só "tem uma propriedade
// docs por coincidência" — a checagem antiga só olhava Array.isArray(data.
// docs), o que deixaria passar qualquer .json de outra origem que por acaso
// tivesse esse formato. Também recusa uma versão de schema mais NOVA do que
// este app entende, em vez de tentar mesclar campos que talvez nem existam
// ainda aqui.
const PROJECT_STATE_EXPORT_KIND = "project-state-export";
const PROJECT_STATE_EXPORT_VERSION = 1;
function validateProjectStateExport(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: "not-json-object" };
  }
  if (!Array.isArray(data.docs)) {
    return { ok: false, reason: "missing-docs" };
  }
  if (data.kind !== PROJECT_STATE_EXPORT_KIND) {
    return { ok: false, reason: "wrong-kind" };
  }
  if (typeof data.version === "number" && data.version > PROJECT_STATE_EXPORT_VERSION) {
    return { ok: false, reason: "newer-version", version: data.version };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Editor de Cenas (Fase 2 do app Windows) — lê a MESMA planilha .xlsx que o
// SenScriptsDecompiler gera (o mesmo arquivo que parseWorkbookEntries já usa
// pra extrair diálogo), só que agora capturando TODOS os parâmetros de cada
// instrução, não só as células tipo "dialog"/"string". Formato real
// confirmado contra um arquivo de cena de verdade (a0000.xlsx, ~43800
// linhas): blocos "FUNCTION" (nome às vezes vazio), cada um com N
// instruções, cada instrução sendo um par de linhas — uma linha de
// cabeçalho ("Location","OP Code", tipo de cada parâmetro seguinte) e a
// linha de dados logo abaixo.
//
// Tipos de coluna observados nos cabeçalhos reais: byte, short, int, float,
// string, dialog, bytearray (parâmetro bruto espalhado 1 byte por coluna),
// fill (fórmula de padding tipo "=16-LENB(...)", nunca editada à mão —
// recalculada sozinha a partir do texto), pointer (fórmula tipo "=A113",
// referência a outra linha da planilha — usada por saltos/condicionais) e,
// raramente, um trio "Start"/"OP Code"/"End" marcando uma sub-instrução
// aninhada (valores sempre vazios, são só marcadores visuais). "fill",
// "pointer", "Start", "End" e o "OP Code" aninhado NUNCA são editáveis por
// aqui — são estrutura/fórmula, não dado do usuário.
    const SCENE_NON_EDITABLE_PARAM_TYPES = new Set(["fill", "pointer", "Start", "End", "OP Code"]);
    function isEditableSceneParamType(type) {
      return typeof type === "string" && type !== "" && !SCENE_NON_EDITABLE_PARAM_TYPES.has(type);
    }

    // Nomes amigáveis dos OP codes documentados (ver Analise-App-Windows11-
    // CS3-Modding-Suite.md), cruzados com o formato real visto em
    // a0000.xlsx. 41 e 54 são multi-variante (o primeiro parâmetro escolhe o
    // formato) — o rótulo avisa isso em vez de fingir um formato único.
    const SCENE_OP_LABELS = {
      2: "Início de evento / sub-rotina",
      5: "Condição (branch)",
      22: "Espera (delay)",
      29: "Criar personagem",
      36: "Diálogo — texto",
      38: "Diálogo — fechar/continuar",
      39: "Diálogo — nome do interlocutor",
      41: "Opção de menu / ARCUS (variantes por sub-tipo)",
      47: "Atribuir animação",
      54: "Câmera (variantes por sub-tipo)",
      55: "Posição/orientação",
      60: "Expressão facial",
      172: "Encadear evento",
    };
    function sceneOpLabel(opCode) {
      return SCENE_OP_LABELS[opCode] || null;
    }

    // Referências tipo "=A113" (sempre vistas na coluna A nas amostras reais,
    // mas o regex aceita qualquer coluna pra não quebrar se aparecer outra).
    function parseScenePointerTarget(rawValue) {
      if (typeof rawValue !== "string") return null;
      const m = /^=([A-Z]+)(\d+)$/.exec(rawValue);
      if (!m) return null;
      return { col: m[1], row: Number(m[2]) };
    }

    // Lê a planilha inteira (formato de células do SheetJS: { "A1": {v:...},
    // "B1": {v:...}, ... }) e monta a árvore FUNCTION -> instruções. Mesmo
    // estilo de varredura de parseWorkbookEntries (agrupar por linha via
    // decode_cell, ordenar, andar linha a linha) — só que capturando TODOS
    // os parâmetros tipados, não só diálogo, e reconhecendo os marcadores
    // "FUNCTION".
    function parseSceneSheet(ws, XLSX) {
      const cellKeys = Object.keys(ws).filter((k) => k[0] !== "!");
      const byRow = new Map();
      for (const key of cellKeys) {
        const addr = XLSX.utils.decode_cell(key);
        if (!byRow.has(addr.r)) byRow.set(addr.r, []);
        byRow.get(addr.r).push({ c: addr.c, v: ws[key].v, f: ws[key].f, ref: key });
      }
      const rowIndices = Array.from(byRow.keys()).sort((a, b) => a - b);

      const functions = [];
      const orphanInstructions = [];
      let currentFunction = null;
      let headerTypes = null; // Map<col0based, tipo>

      const cellDisplayValue = (cell) =>
        cell === undefined ? null : cell.f !== undefined && cell.f !== null ? "=" + cell.f : cell.v;

      for (const r of rowIndices) {
        const cells = byRow.get(r).sort((a, b) => a.c - b.c);
        const colA = cells.find((c) => c.c === 0);
        const colB = cells.find((c) => c.c === 1);

        if (colA && colA.v === "FUNCTION") {
          currentFunction = { name: (colB && colB.v) || "", row: r + 1, instructions: [] };
          functions.push(currentFunction);
          continue;
        }
        if (colA && colA.v === "Location") {
          headerTypes = new Map();
          for (const cell of cells) {
            if (cell.c >= 2 && cell.v !== null && cell.v !== undefined && cell.v !== "") {
              headerTypes.set(cell.c, cell.v);
            }
          }
          continue;
        }
        if (colA && typeof colA.v === "number" && headerTypes) {
          const location = colA.v;
          const opCode = colB ? colB.v : null;
          const params = [];
          for (const [col0, type] of headerTypes) {
            const cell = cells.find((c) => c.c === col0);
            params.push({ col: col0 + 1, type, value: cellDisplayValue(cell) });
          }
          const instruction = { row: r + 1, location, opCode, params, label: sceneOpLabel(opCode) };
          if (currentFunction) currentFunction.instructions.push(instruction);
          else orphanInstructions.push(instruction);
        }
      }

      return { functions, orphanInstructions };
    }

    // Acha o parâmetro de uma instrução numa coluna (1-based) específica —
    // usado pra validar uma edição antes de aplicar.
    function findSceneParam(instruction, col) {
      return instruction.params.find((p) => p.col === col) || null;
    }

    function validateSceneEdit(instruction, col) {
      const param = findSceneParam(instruction, col);
      if (!param) return { ok: false, reason: "coluna não faz parte dos parâmetros desta instrução" };
      if (!isEditableSceneParamType(param.type)) {
        return { ok: false, reason: `coluna do tipo "${param.type}" não é editável (estrutura/fórmula, não dado)` };
      }
      return { ok: true };
    }

    // Aplica edições { row, col, value } (1-based, iguais ao endereço Excel)
    // de volta numa planilha SheetJS, sem tocar em NENHUMA outra célula —
    // por construção, já que só escreve exatamente os endereços informados.
    // Retorna uma cópia nova (não muta `ws`), pra o chamador decidir quando
    // substituir de fato.
    function applySceneEditsToWorksheet(ws, XLSX, edits) {
      const next = Object.assign({}, ws);
      for (const e of edits) {
        const addr = XLSX.utils.encode_cell({ r: e.row - 1, c: e.col - 1 });
        const existing = next[addr] || {};
        const isNumber = typeof e.value === "number";
        const cell = Object.assign({}, existing, { v: e.value, t: isNumber ? "n" : "s" });
        delete cell.f; // valor editado por mão nunca é fórmula
        next[addr] = cell;
      }
      return next;
    }

// ---------------------------------------------------------------------
// Fase 3 — Assistente de ID de arquivo novo (a/c/t/r/m/e/f/v/i + número).
//
// Fórmula confirmada byte a byte contra o exemplo do PDF "Documentation
// for script files editing in CS3" (autor Twn): "m0292" -> 0x000625E8.
// Conferida à mão: base('m')=0x61A80=400000 decimal; 292*10=2920;
// 400000+2920=402920=0x625E8. Bate exatamente com o exemplo do guia.
// A tabela de offsets abaixo é a mesma do PDF (um bloco de 100000 IDs por
// prefixo, exceto 'i' que começa em 1300000 — também tirado do PDF).
// ---------------------------------------------------------------------
    const SCRIPT_FILE_ID_BASE = {
      a: 0x0,
      c: 0x186a0,
      t: 0x30d40,
      r: 0x493e0,
      m: 0x61a80,
      e: 0x7a120,
      f: 0x927c0,
      v: 0xaae60,
      i: 0x13d620,
    };
    // Aceita "m0292", "m0292.dat", "m0292.xlsx", com ou sem espaço — só olha
    // pro prefixo (letra + dígitos) no começo do nome, ignora o resto.
    function computeScriptFileId(fileName) {
      const m = /^([acmtrefvi])(\d+)/i.exec(String(fileName || "").trim());
      if (!m) return null;
      const letter = m[1].toLowerCase();
      const suffix = parseInt(m[2], 10);
      const base = SCRIPT_FILE_ID_BASE[letter];
      if (base === undefined) return null;
      const id = base + suffix * 0xa;
      return {
        letter,
        suffix,
        id,
        hex: "0x" + id.toString(16).toUpperCase().padStart(8, "0"),
      };
    }

// ---------------------------------------------------------------------
// Fase 3 — Editor de OPS (arquivos data/ops/pc/*.ops — XML puro, define os
// pontos de entrada/gatilho no mapa via tags <EntryBox .../> dentro de
// <Entrys>...</Entrys>). Formato do atributo confirmado contra o exemplo
// real citado no PDF (name/next/entry/placeId/flag/pos/distance/cameraDir/
// entryType/markPos/type). Por ser texto puro (não binário), a estratégia
// aqui é SEMPRE cirúrgica: nunca reconstrói a linha inteira, só troca o
// VALOR do atributo pedido na posição exata onde ele já estava — preserva
// indentação, ordem de atributos, atributos desconhecidos e qualquer outra
// linha do arquivo (comentários, cabeçalho XML) 100% intactos.
// ---------------------------------------------------------------------
    function detectLineEnding(text) {
      return typeof text === "string" && text.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
    }

    // Varre o texto e acha toda linha com "<EntryBox" nela, extraindo os
    // atributos (nome/valor/posição na string) na ordem em que aparecem.
    function findOpsEntryBoxes(xmlText) {
      const lineEnding = detectLineEnding(xmlText);
      const lines = String(xmlText || "").split(/\r\n|\r|\n/);
      const boxes = [];
      const attrRe = /([A-Za-z_][\w:-]*)="([^"]*)"/g;
      lines.forEach((line, lineIndex) => {
        if (!/<EntryBox\b/.test(line)) return;
        const attrs = [];
        attrRe.lastIndex = 0;
        let m;
        while ((m = attrRe.exec(line)) !== null) {
          attrs.push({ name: m[1], value: m[2], start: m.index, end: attrRe.lastIndex });
        }
        boxes.push({ lineIndex, attrs });
      });
      return { lines, boxes, lineEnding };
    }

    function opsEntryAttr(box, name) {
      if (!box) return null;
      const a = box.attrs.find((x) => x.name === name);
      return a ? a.value : null;
    }

    // edits: [{ lineIndex, name, value }]. Retorna { lines, lineEnding } —
    // chamador junta com lines.join(lineEnding) (ou usa opsTextFromLines).
    function applyOpsAttrEdits(lines, boxes, edits) {
      const nextLines = lines.slice();
      const byLine = new Map();
      for (const e of edits) {
        if (!byLine.has(e.lineIndex)) byLine.set(e.lineIndex, []);
        byLine.get(e.lineIndex).push(e);
      }
      for (const [lineIndex, lineEdits] of byLine) {
        const box = boxes.find((b) => b.lineIndex === lineIndex);
        if (!box) continue;
        let line = nextLines[lineIndex];
        // aplica da direita pra esquerda (maior "start" primeiro) pra não
        // invalidar as posições dos outros atributos da mesma linha.
        const resolved = lineEdits
          .map((e) => ({ ...e, attr: box.attrs.find((a) => a.name === e.name) }))
          .filter((e) => e.attr)
          .sort((a, b) => b.attr.start - a.attr.start);
        for (const e of resolved) {
          const { start, end } = e.attr;
          line = line.slice(0, start) + `${e.name}="${e.value}"` + line.slice(end);
        }
        nextLines[lineIndex] = line;
      }
      return nextLines;
    }

    function opsTextFromLines(lines, lineEnding) {
      return lines.join(lineEnding || "\n");
    }

    // Clona uma EntryBox existente (mesma técnica citada no PDF: "copiar e
    // colar uma entrada existente") trocando só os atributos informados em
    // `overrides` — preserva indentação/ordem/atributos não mencionados da
    // linha original. Retorna a nova linha (string), pronta pra inserir.
    function cloneOpsEntryBoxLine(box, line, overrides) {
      const fakeEdits = Object.keys(overrides || {})
        .filter((name) => box.attrs.some((a) => a.name === name))
        .map((name) => ({ lineIndex: box.lineIndex, name, value: overrides[name] }));
      const [newLine] = applyOpsAttrEdits([line], [{ lineIndex: 0, attrs: box.attrs }], fakeEdits.map((e) => ({ ...e, lineIndex: 0 })));
      return newLine;
    }

    function insertOpsLine(lines, afterLineIndex, newLine) {
      const next = lines.slice();
      next.splice(afterLineIndex + 1, 0, newLine);
      return next;
    }

// ---------------------------------------------------------------------
// Fase 3 — Editor de tabela de itens (t_item_en.tbl e formato semelhante).
//
// Reverse engenharia feita em cima do ARQUIVO REAL que o usuário mandou
// (t_item_en.tbl, 311891 bytes) — sem esse arquivo essa função não teria
// sido escrita (mesma disciplina da Fase 2: nunca escrever parser binário
// sem amostra real). Estrutura observada, confirmada por varredura no
// arquivo inteiro em Python antes de portar pra cá:
//
//   ... 0xFF 0xFF <flag em MAIÚSCULAS 1-15 chars><NUL>
//       <127 bytes de dados numéricos — NUNCA tocados, formato ainda não
//        entendido (preço? peso? stats? — não precisamos saber pra editar
//        texto com segurança, só precisamos NUNCA escrever nesses bytes)>
//       <nome em UTF-8><NUL>
//       <descrição em UTF-8, pode ter '\n' embutido separando o resumo
//        entre colchetes da descrição longa><NUL>
//       <padding de zeros até o próximo registro>
//
// Cobertura real medida: no arquivo de amostra, ~89% dos registros (834 de
// 937 declarados no cabeçalho) batem esse padrão com confiança total (nome
// e descrição decodificam como UTF-8 limpo, sem caractere de controle além
// de \n). O resto — provavelmente pertence a uma seção com layout de bloco
// numérico diferente (o cabeçalho do arquivo declara pelo menos 3 seções:
// "item"=937, "item_q"=307, "item"=288 de novo — possivelmente layouts
// distintos por seção, não totalmente decifrados) — fica de fora de
// propósito: nunca aparece na lista editável, nunca é tocado ao salvar.
// Editar só troca nome/descrição por substituição cirúrgica de bytes
// (igual ao editor de OPS): o bloco numérico de 127 bytes e tudo mais no
// arquivo permanece byte a byte idêntico.
// ---------------------------------------------------------------------
    const TBL_ITEM_GAP_AFTER_FLAG = 127;

    function tblFindCStringEnd(bytes, start) {
      let i = start;
      while (i < bytes.length && bytes[i] !== 0) i++;
      return i < bytes.length ? i : -1;
    }

    // true se o texto não tem NENHUM caractere de controle além de '\n' —
    // usado tanto pra validar um registro encontrado quanto pra impedir
    // que uma edição do usuário injete um NUL (destruiria o terminador C)
    // ou outro controle no meio da string.
    function tblIsCleanText(s, maxLen) {
      if (typeof s !== "string" || s.length === 0 || s.length >= maxLen) return false;
      for (let i = 0; i < s.length; i++) {
        const code = s.codePointAt(i);
        if (code < 0x20 && s[i] !== "\n") return false;
      }
      return true;
    }

    // Acha, no arquivo inteiro, todo registro reconhecido com confiança.
    // `bytes` é um Uint8Array. Usa uma "string binária" (1 char = 1 byte)
    // só pra rodar regex procurando o padrão 0xFF 0xFF + flag maiúscula —
    // o texto de verdade (nome/descrição) sempre é decodificado do
    // Uint8Array original como UTF-8, nunca dessa string binária (senão
    // caracteres multi-byte tipo "↑" quebrariam).
    function parseItemTable(bytes) {
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const flagRe = /[A-Z]{1,15}\x00/g;
      const records = [];
      let unrecognized = 0;
      let idx = bin.indexOf("\xff\xff");
      while (idx !== -1) {
        flagRe.lastIndex = idx + 2;
        const m = flagRe.exec(bin);
        if (m && m.index === idx + 2) {
          const flag = bin.slice(idx + 2, m.index + m[0].length - 1);
          const flagEndNul = m.index + m[0].length;
          const nameStart = flagEndNul + TBL_ITEM_GAP_AFTER_FLAG;
          const nameEnd = nameStart < bytes.length ? tblFindCStringEnd(bytes, nameStart) : -1;
          if (nameEnd !== -1) {
            const descStart = nameEnd + 1;
            const descEnd = tblFindCStringEnd(bytes, descStart);
            if (descEnd !== -1) {
              let name = null;
              let desc = null;
              try {
                name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(nameStart, nameEnd));
                desc = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(descStart, descEnd));
              } catch (e) {
                name = null;
              }
              if (name !== null && desc !== null && tblIsCleanText(name, 80) && tblIsCleanText(desc, 1000)) {
                records.push({ sentinel: idx, flag, nameStart, nameEnd, name, descStart, descEnd, desc });
              } else {
                unrecognized++;
              }
            } else {
              unrecognized++;
            }
          } else {
            unrecognized++;
          }
        }
        idx = bin.indexOf("\xff\xff", idx + 1);
      }
      return { records, unrecognized, totalBytes: bytes.length };
    }

    // Substitui SÓ o trecho [start,end) (nome ou descrição, sem o NUL) por
    // `value` codificado em UTF-8, deslocando tudo depois — igual à
    // estratégia cirúrgica do editor de OPS. O NUL original (que fica em
    // `end`) é preservado, não recriado. IMPORTANTE: como isso muda o
    // tamanho do arquivo, qualquer outro offset calculado ANTES dessa
    // chamada fica inválido — o chamador tem que rodar parseItemTable de
    // novo no resultado antes de aplicar a próxima edição.
    function applyItemTableFieldEdit(bytes, start, end, value) {
      const newBytes = new TextEncoder().encode(value);
      const before = bytes.subarray(0, start);
      const after = bytes.subarray(end);
      const merged = new Uint8Array(before.length + newBytes.length + after.length);
      merged.set(before, 0);
      merged.set(newBytes, before.length);
      merged.set(after, before.length + newBytes.length);
      return merged;
    }

// ---------------------------------------------------------------------
// Fase 3 — Editor de "tabelas com tag" (t_place.tbl, t_name.tbl — e em
// tese t_evtable.tbl, mas esse não tem nenhum campo traduzível, só
// códigos internos de evento, então não ganhou editor de texto aqui).
//
// Reverse engenharia feita em cima dos 3 arquivos REAIS que o usuário
// mandou (t_place.tbl 30026 bytes/474 lugares, t_evtable.tbl 132413
// bytes/1981 eventos, t_name.tbl 150070 bytes/1581 nomes) — todos os 3
// compartilham o MESMO cabeçalho de registro:
//
//   <tag ASCII, ex "PlaceTableData"><NUL>
//   <uint16 LE "lenField" = tamanho do registro contado a partir do byte
//    logo APÓS o próprio lenField>
//   <uint16 LE "idField">
//   <N strings NUL-terminadas...>
//
// A tag aparece 1x a mais no arquivo do que o número de registros
// declarado no cabeçalho (a 1ª ocorrência é só o preâmbulo do arquivo,
// nunca um registro de verdade) — confirmado nos 3 arquivos reais.
//
// O que MUDA entre as tabelas é como as strings terminam (analisado campo
// a campo contra os bytes de verdade, não assumido):
//   - t_place.tbl: as strings consomem o registro INTEIRO até o próximo
//     limite (sem sobra nenhuma — confirmado nos 474 registros, zero
//     exceções). A quantidade de campos varia por registro (10, 11 ou 12
//     — lugares de nível superior têm menos campos que sub-lugares
//     dentro de uma cidade), mas o título/nome traduzível está SEMPRE na
//     mesma posição contando de trás pra frente: 4º campo a partir do
//     fim, em TODOS os 474 registros, sem exceção.
//   - t_name.tbl: TODO registro (1581 de 1581, zero exceções) tem
//     exatamente 6 strings, seguidas de 19 bytes de sobra FIXOS (nunca
//     tocados — formato não decifrado, provavelmente flags/posição). O
//     nome de exibição do personagem é sempre o 1º campo.
//
// lenField nem sempre bate 100% com o tamanho real no arquivo ORIGINAL
// (achei 4 de 1581 registros em t_name.tbl, todos com um glifo "①"/"②"
// no nome, onde o lenField já vem 2 bytes errado — provavelmente bug de
// alguma ferramenta de conversão anterior que gerou esse .tbl a partir do
// formato original do jogo). Por isso a localização de registro NUNCA usa
// lenField como fonte de verdade — só a posição da PRÓXIMA tag/fim do
// arquivo. Mas ao EDITAR, o lenField do registro editado é sempre
// recalculado do zero (não ajustado por delta) — não propaga esse tipo
// de inconsistência herdada.
// ---------------------------------------------------------------------
    function tblBytesToBinaryString(bytes) {
      let s = "";
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return s;
    }

    // Acha toda ocorrência de `tagString + "\0"` no arquivo (posição em
    // bytes) — usa a mesma técnica "string binária" (1 char = 1 byte) do
    // editor de item, só pra permitir usar String.indexOf num Uint8Array.
    function tblFindTagPositions(bytes, tagString) {
      const tagBytes = new TextEncoder().encode(tagString + "\0");
      const bin = tblBytesToBinaryString(bytes);
      const tagBin = tblBytesToBinaryString(tagBytes);
      const positions = [];
      let idx = bin.indexOf(tagBin);
      while (idx !== -1) {
        positions.push(idx);
        idx = bin.indexOf(tagBin, idx + 1);
      }
      return { positions, tagFullLen: tagBytes.length };
    }

    function tblReadRecordHeader(bytes, start, tagFullLen) {
      const p = start + tagFullLen;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { fieldsStart: p + 4, lenField: view.getUint16(p, true), idField: view.getUint16(p + 2, true) };
    }

    function tblDecodeStringRange(bytes, start, end) {
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(start, end));
      } catch (e) {
        return null;
      }
    }

    // Recalcula e escreve o lenField (2 bytes LE, logo após a tag) de UM
    // registro depois de editar seu texto. `newTotalRecordSize` é o
    // tamanho do registro INTEIRO (da tag até o fim) já com a edição
    // aplicada.
    function tblRewriteLenField(bytes, recordStart, tagFullLen, newTotalRecordSize) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      view.setUint16(recordStart + tagFullLen, newTotalRecordSize - (tagFullLen + 2), true);
    }

    // Substitui o texto de UM registro (splice cirúrgico, igual ao editor
    // de item) E corrige o lenField DESSE registro — diferença chave em
    // relação ao t_item_en.tbl, que não tem campo de tamanho nenhum pra
    // manter em dia. `field` é { start, end } (limites do texto antigo,
    // sem o NUL — vêm de parsePlaceTable/parseNameTable). Retorna um
    // Uint8Array novo; o chamador tem que reparsear antes da próxima
    // edição (mesma disciplina do editor de OPS/item).
    function applyTaggedTableFieldEdit(bytes, recordStart, recordEnd, tagFullLen, field, value) {
      const newTextBytes = new TextEncoder().encode(value);
      const before = bytes.subarray(0, field.start);
      const after = bytes.subarray(field.end);
      const merged = new Uint8Array(before.length + newTextBytes.length + after.length);
      merged.set(before, 0);
      merged.set(newTextBytes, before.length);
      merged.set(after, before.length + newTextBytes.length);
      const delta = newTextBytes.length - (field.end - field.start);
      tblRewriteLenField(merged, recordStart, tagFullLen, recordEnd - recordStart + delta);
      return merged;
    }

    // t_place.tbl — título/nome do lugar = 4º campo contando do FIM.
    function parsePlaceTable(bytes) {
      const { positions, tagFullLen } = tblFindTagPositions(bytes, "PlaceTableData");
      if (positions.length < 2) return { records: [], unrecognized: 0, headerCount: 0 };
      const recordStarts = positions.slice(1);
      const records = [];
      let unrecognized = 0;
      for (let i = 0; i < recordStarts.length; i++) {
        const start = recordStarts[i];
        const end = i + 1 < recordStarts.length ? recordStarts[i + 1] : bytes.length;
        const { fieldsStart, idField } = tblReadRecordHeader(bytes, start, tagFullLen);
        let p = fieldsStart;
        const strings = [];
        let ok = true;
        while (p < end) {
          const strEnd = tblFindCStringEnd(bytes, p);
          if (strEnd === -1 || strEnd >= end) { ok = false; break; }
          strings.push({ start: p, end: strEnd });
          p = strEnd + 1;
        }
        if (!ok || p !== end || strings.length < 4) {
          unrecognized++;
          continue;
        }
        const field = strings[strings.length - 4];
        const text = tblDecodeStringRange(bytes, field.start, field.end);
        if (text === null || !tblIsCleanText(text, 200)) {
          unrecognized++;
          continue;
        }
        records.push({ start, end, tagFullLen, idField, fieldStart: field.start, fieldEnd: field.end, text });
      }
      return { records, unrecognized, headerCount: recordStarts.length };
    }

    // t_name.tbl — exatamente 6 campos por registro, o nome de exibição é
    // sempre o 1º; 19 bytes de sobra depois, nunca tocados.
    function parseNameTable(bytes) {
      const { positions, tagFullLen } = tblFindTagPositions(bytes, "NameTableData");
      if (positions.length < 2) return { records: [], unrecognized: 0, headerCount: 0 };
      const recordStarts = positions.slice(1);
      const records = [];
      let unrecognized = 0;
      for (let i = 0; i < recordStarts.length; i++) {
        const start = recordStarts[i];
        const end = i + 1 < recordStarts.length ? recordStarts[i + 1] : bytes.length;
        const { fieldsStart, idField } = tblReadRecordHeader(bytes, start, tagFullLen);
        let p = fieldsStart;
        const strings = [];
        let ok = true;
        for (let k = 0; k < 6; k++) {
          const strEnd = tblFindCStringEnd(bytes, p);
          if (strEnd === -1 || strEnd >= end) { ok = false; break; }
          strings.push({ start: p, end: strEnd });
          p = strEnd + 1;
        }
        if (!ok) {
          unrecognized++;
          continue;
        }
        const field = strings[0];
        const text = tblDecodeStringRange(bytes, field.start, field.end);
        if (text === null || !tblIsCleanText(text, 120)) {
          unrecognized++;
          continue;
        }
        records.push({ start, end, tagFullLen, idField, fieldStart: field.start, fieldEnd: field.end, text });
      }
      return { records, unrecognized, headerCount: recordStarts.length };
    }

// ---------------------------------------------------------------------
// Fase 3b — Editor GENÉRICO de tabelas "com tag", cobrindo as tabelas
// novas descobertas em Text.zip (54 arquivos .tbl de data/text) que têm
// frase legível pro jogador, além de nome/lugar já existentes acima.
// Mesma técnica de tag+lenField(+idField opcional)+strings, mas
// parametrizada por um "profile" (ver TBL_TABLE_PROFILES) em vez de uma
// função dedicada por tabela — cada tabela nova só precisa dizer a tag,
// quantos bytes de cabeçalho vêm depois da tag (2 = só lenField; 4 =
// lenField+idField, igual place/name) e QUAIS campos (por posição, do
// início ou do fim da lista de strings do registro) são o texto
// traduzível.
//
// Cada profile abaixo foi validado rodando esse parser contra o arquivo
// REAL inteiro que o usuário mandou (dentro de Text.zip) ANTES de virar
// código aqui — a % de registros reconhecidos com texto de verdade em
// cada campo está documentada ao lado de cada profile.
// ---------------------------------------------------------------------

    // Alguns campos (ex: QSTitle) têm 1 byte de controle (rank/ícone) colado
    // ANTES do texto de verdade, dentro do mesmo trecho até o NUL — sem
    // isso, tblIsCleanText rejeitaria o campo inteiro por causa desse 1
    // byte. Só pula o byte se for controle (<0x20, exceto '\n'); o prefixo
    // fica de fora do trecho editável, nunca é tocado por uma edição.
    function tblCleanFieldBounds(bytes, start, end) {
      if (start < end && bytes[start] < 0x20 && bytes[start] !== 10) {
        return { start: start + 1, end };
      }
      return { start, end };
    }

    // Igual tblReadRecordHeader, mas com o tamanho do cabeçalho (depois da
    // tag) parametrizável: 4 = lenField(u16)+idField(u16) (place/name/a
    // maioria das novas), 2 = só lenField, sem idField (caso do
    // LinkAbText — confirmado comparando lenField contra o tamanho real
    // do registro nos 29 registros do arquivo do usuário).
    function tblReadRecordHeaderGeneric(bytes, start, tagFullLen, headerExtraBytes) {
      const p = start + tagFullLen;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const lenField = view.getUint16(p, true);
      const idField = headerExtraBytes >= 4 ? view.getUint16(p + 2, true) : null;
      return { fieldsStart: p + headerExtraBytes, lenField, idField };
    }

    // Anda pelas strings NUL-terminadas de um registro [fieldsStart,end) —
    // mesmo passo a passo usado (duplicado) em parsePlaceTable/
    // parseNameTable. Retorna null se algum trecho não fechar certinho
    // dentro do registro (registro rejeitado, não é "meio reconhecido").
    function tblWalkRecordStrings(bytes, fieldsStart, end) {
      const strings = [];
      let p = fieldsStart;
      while (p < end) {
        const strEnd = tblFindCStringEnd(bytes, p);
        if (strEnd === -1 || strEnd >= end) return null;
        strings.push({ start: p, end: strEnd });
        p = strEnd + 1;
      }
      if (p !== end) return null;
      return strings;
    }

    // Parser genérico orientado a `profile` (ver TBL_TABLE_PROFILES) —
    // substitui escrever uma função dedicada pra cada tabela nova. Um
    // registro só entra em `records` se TODOS os campos do profile forem
    // encontrados e passarem em tblIsCleanText — meio reconhecido não
    // conta, vira `unrecognized` (mesma disciplina de zero-risco dos
    // editores anteriores).
    function parseTaggedTableByProfile(bytes, profile) {
      const { positions, tagFullLen } = tblFindTagPositions(bytes, profile.tag);
      if (positions.length < 2) return { records: [], unrecognized: 0, headerCount: 0 };
      const recordStarts = positions.slice(1);
      const records = [];
      let unrecognized = 0;
      const headerExtraBytes = profile.headerExtraBytes || 4;
      for (let i = 0; i < recordStarts.length; i++) {
        const start = recordStarts[i];
        const end = i + 1 < recordStarts.length ? recordStarts[i + 1] : bytes.length;
        const { fieldsStart, idField } = tblReadRecordHeaderGeneric(bytes, start, tagFullLen, headerExtraBytes);
        const strings = fieldsStart <= end ? tblWalkRecordStrings(bytes, fieldsStart, end) : null;
        if (!strings) { unrecognized++; continue; }
        if (profile.minFieldCount != null && strings.length < profile.minFieldCount) { unrecognized++; continue; }
        if (profile.maxFieldCount != null && strings.length > profile.maxFieldCount) { unrecognized++; continue; }

        const fields = {};
        let allOk = true;
        for (const fdef of profile.fields) {
          const idx = fdef.fromEnd != null ? strings.length - fdef.fromEnd : fdef.fromStart;
          if (idx == null || idx < 0 || idx >= strings.length) { allOk = false; break; }
          const raw = strings[idx];
          const bounds = fdef.stripLeadingControl ? tblCleanFieldBounds(bytes, raw.start, raw.end) : raw;
          const text = tblDecodeStringRange(bytes, bounds.start, bounds.end);
          if (text === null || !tblIsCleanText(text, fdef.maxLen || 500)) { allOk = false; break; }
          fields[fdef.key] = { start: bounds.start, end: bounds.end, text, label: fdef.label };
        }
        if (!allOk) { unrecognized++; continue; }
        records.push({ start, end, tagFullLen, idField, fields });
      }
      return { records, unrecognized, headerCount: recordStarts.length };
    }

    // Registro de tabelas suportadas pelo editor unificado. `id`/`label`
    // são só pra UI; `fileHint` é o nome típico do arquivo (documentação,
    // não usado pra detectar — a detecção é 100% pelo conteúdo/tag).
    //
    //   - text (t_text.tbl, TextTableData): 829 registros no arquivo real,
    //     765 com texto (o resto é registro vazio/placeholder) — rótulo de
    //     ação/UI curto ("Talk to", "Ride", "Settings").
    //   - activevoice (t_active.tbl, ActiveVoiceTableData): 592 registros,
    //     257 com fala de verdade no 5º campo (índice 4) — o resto são
    //     variantes sem áudio/texto (barra vazia).
    //   - mapjump (t_jump.tbl, MapJumpData): 300 registros, 252 com nome
    //     de destino no 2º campo (índice 1) — pontos de viagem rápida.
    //   - questtitle (t_quest.tbl, QSTitle): 114 de 114 registros (100%),
    //     título entre 〈 〉 no 1º campo, com 1 byte de controle (rank)
    //     colado antes — daí o stripLeadingControl.
    //   - mg08text (t_mg08.tbl, MG08Text): 86 de 87 registros, texto único
    //     no 1º campo — textos de UI de um minigame.
    //   - monster (t_mons.tbl, tag "status"): 333 de 333 registros (100%),
    //     nome no penúltimo campo e descrição no último, os dois presentes
    //     em TODOS os registros — bestiário completo (nome + flavor text).
    //   - linkability (t_linkab.tbl, LinkAbText): 28 de 29 registros — nome
    //     + descrição de habilidade de vínculo. ATENÇÃO, duas pegadinhas
    //     confirmadas byte a byte: (1) essa tabela NÃO tem idField (só 2
    //     bytes de cabeçalho, não 4); (2) só o 1º registro (rank 0) tem um
    //     campo vazio antes do nome — nos outros 28, o byte de rank (1-15)
    //     fica GRUDADO no início do nome dentro do mesmo campo. Por isso
    //     os campos são contados do FIM (fromEnd) em vez do início, e o
    //     nome usa stripLeadingControl pra tirar o byte de rank.
    //
    // Tabelas investigadas e DEIXADAS DE FORA por enquanto (formato
    // inconsistente entre registros, arriscado extrair sem mais reverse
    // engenharia): QSChar/t_notechar (bio de personagem — elenco
    // principal tem 1 campo a mais que os coadjuvantes, deslocando tudo),
    // MasterQuartz*/t_mstqrt, Shop*/t_shop, QSCook/t_notecook,
    // NaviTextData/t_navi, ItemHelpData/t_itemhelp, corpo do QSText (texto
    // de missão — posição do campo varia registro a registro). Nome/lugar
    // (t_name.tbl/t_place.tbl) continuam com suas próprias funções
    // dedicadas (parseNameTable/parsePlaceTable) — formato de campo fixo
    // que não encaixa neste motor genérico (que exige as strings
    // preencherem o registro inteiro, sem sobra) — detectTblProfile chama
    // as duas direto, fora do array de profiles.
    const TBL_TABLE_PROFILES = [
      {
        id: "text", label: "Textos de UI (ações/rótulos curtos)", fileHint: "t_text.tbl",
        tag: "TextTableData", headerExtraBytes: 4,
        fields: [{ key: "text", fromStart: 0, label: "Texto", maxLen: 200 }],
      },
      {
        id: "activevoice", label: "Falas curtas (Active Voice)", fileHint: "t_active.tbl",
        tag: "ActiveVoiceTableData", headerExtraBytes: 4,
        fields: [{ key: "text", fromStart: 4, label: "Fala", maxLen: 600 }],
      },
      {
        id: "mapjump", label: "Nomes de destino (viagem rápida)", fileHint: "t_jump.tbl",
        tag: "MapJumpData", headerExtraBytes: 4,
        fields: [{ key: "text", fromStart: 1, label: "Nome do destino", maxLen: 200 }],
      },
      {
        id: "questtitle", label: "Títulos de missão", fileHint: "t_quest.tbl",
        tag: "QSTitle", headerExtraBytes: 4,
        fields: [{ key: "text", fromStart: 0, label: "Título da missão", maxLen: 200, stripLeadingControl: true }],
      },
      {
        id: "mg08text", label: "Textos do minigame (MG08)", fileHint: "t_mg08.tbl",
        tag: "MG08Text", headerExtraBytes: 4,
        fields: [{ key: "text", fromStart: 0, label: "Texto", maxLen: 200 }],
      },
      {
        id: "monster", label: "Bestiário (nome + descrição)", fileHint: "t_mons.tbl",
        tag: "status", headerExtraBytes: 4,
        fields: [
          { key: "name", fromEnd: 2, label: "Nome do monstro", maxLen: 120 },
          { key: "desc", fromEnd: 1, label: "Descrição", maxLen: 500 },
        ],
      },
      // LinkAbText: o registro do 1º item da tabela tem um campo extra
      // vazio antes do nome (rank 0 vira um NUL "solto"), mas os demais
      // NÃO têm esse campo vazio — o byte de rank (1-15) fica GRUDADO no
      // início do nome dentro do mesmo campo (daí precisar contar a
      // partir do FIM — fromEnd — em vez do início, e usar
      // stripLeadingControl pra tirar esse byte de rank do texto editável).
      {
        id: "linkability", label: "Habilidades de vínculo (nome + descrição)", fileHint: "t_linkab.tbl",
        tag: "LinkAbText", headerExtraBytes: 2,
        fields: [
          { key: "name", fromEnd: 2, label: "Nome da habilidade", maxLen: 120, stripLeadingControl: true },
          { key: "desc", fromEnd: 1, label: "Descrição", maxLen: 400 },
        ],
      },
    ];

    // Abaixo de quantos registros um "acerto" do item table (0xFF 0xFF +
    // flag, sem nenhuma tag ancorando) é ignorado na detecção automática.
    // Diferente das tabelas com tag (praticamente impossível bater com um
    // arquivo errado por acaso, já que a tag é um texto ASCII específico),
    // o padrão do item table é genérico o bastante pra, em arquivos
    // grandes sem relação nenhuma, coincidir por acaso um punhado de
    // vezes — confirmado contra os 51 arquivos reais do Text.zip:
    // t_evtable.tbl "achou" 21 pseudo-itens (na real, códigos de evento
    // tipo "_51_01"/"r2290") e t_magic.tbl achou 114 (nome cortado no
    // meio + "magic" repetido como "descrição") — nenhum dos dois é uma
    // tabela de item de verdade. Os 2 arquivos reais de item que o
    // usuário mandou têm 834 registros cada, bem acima deste teto.
    const TBL_ITEM_DETECTION_MIN_RECORDS = 200;

    // Detecta automaticamente qual tabela é o arquivo carregado: tenta o
    // parser sentinel do item table (0xFF 0xFF + flag, sem tag), os
    // parsers dedicados de nome/lugar (formato de campo fixo, não encaixa
    // no motor genérico) e cada profile de TBL_TABLE_PROFILES — devolve
    // quem reconheceu MAIS registros. Assim o usuário só precisa "abrir o
    // arquivo", sem escolher o tipo na mão — o editor unificado descobre
    // sozinho.
    function detectTblProfile(bytes) {
      let best = null;
      const itemResult = parseItemTable(bytes);
      if (itemResult.records.length >= TBL_ITEM_DETECTION_MIN_RECORDS) {
        best = { kind: "item", id: "item", label: "Itens (nome + descrição)", result: itemResult };
      }
      const nameResult = parseNameTable(bytes);
      if (nameResult.records.length > 0 && (!best || nameResult.records.length > best.result.records.length)) {
        best = { kind: "name", id: "name", label: "Nomes de personagem", result: nameResult };
      }
      const placeResult = parsePlaceTable(bytes);
      if (placeResult.records.length > 0 && (!best || placeResult.records.length > best.result.records.length)) {
        best = { kind: "place", id: "place", label: "Lugares/capítulos", result: placeResult };
      }
      for (const profile of TBL_TABLE_PROFILES) {
        const result = parseTaggedTableByProfile(bytes, profile);
        if (result.records.length > 0 && (!best || result.records.length > best.result.records.length)) {
          best = { kind: "tagged", id: profile.id, label: profile.label, profile, result };
        }
      }
      return best;
    }

const TLoHCore = {
  PT_WORDS,
  EN_WORDS,
  LANG_SAMPLE_PT,
  LANG_SAMPLE_EN,
  buildTrigramCounts,
  rankTrigrams,
  TRIGRAM_PROFILE_SIZE,
  TRIGRAM_OUT_OF_PLACE,
  PT_TRIGRAM_PROFILE,
  EN_TRIGRAM_PROFILE,
  trigramDistance,
  TRIGRAM_MIN_MARGIN,
  detectLanguageByTrigram,
  detectLanguage,
  baseName,
  safeForFilename,
  escapeXml,
  tmxTimestamp,
  CODE_REGEX_SOURCE,
  matchAllCodes,
  CODE_GLOSSARY,
  classifyCode,
  extractCodes,
  protectCodes,
  restoreCodes,
  restoreCodesTolerant,
  findLeakedMarkers,
  findInventedCodes,
  looksLikeUntranslated,
  retryAttemptOf,
  seedForAttempt,
  temperatureForAttempt,
  temConteudoDeTexto,
  modelReturnedNothing,
  COHERENCE_CRITICAL_MAX,
  COHERENCE_OK_MIN,
  coherenceIssueSeverity,
  makeCoherenceIssue,
  buildCoherenceReviewSystemPrompt,
  buildCoherenceReviewUserContent,
  parseCoherenceReviewResponse,
  temLoopDegenerativo,
  respostaMuitoCurtaParaOriginal,
  codeCountRegrediu,
  prepareForLlm,
  reassembleFromLlm,
  sanitizeTranslation,
  validateTranslationIntegrity,
  utf8Length,
  PUNCT_REGEX,
  protectPunctuation,
  restorePunctuation,
  tokenizeForSimilarity,
  textSimilarity,
  findSimilarInMemory,
  splitIntoSentences,
  groupSentencesIntoLines,
  originalLineWordCounts,
  wrapProportionalToOriginal,
  wrapToLineCount,
  parseTwoColumnImport,
  parseRetryAfterMs,
  computeBackoffDelay,
  createRateLimitGate,
  noteRateLimited,
  waitForRateLimitGate,
  LLM_BATCH_SIZE,
  isLocalOpenAiEndpoint,
  llmBatchSizeFor,
  llmPacingFor,
  llmProviderLabel,
  fewShotCountFor,
  pickFewShotExamples,
  filterGlossaryForTexts,
  FEW_SHOT_BASE,
  buildLlmSystemPrompt,
  buildLlmBatchSystemPrompt,
  validateBatchTranslationsArray,
  extractAnthropicToolInput,
  parseBatchTranslationResponse,
  protectProperNouns,
  restoreProperNouns,
  glossaryCompileCache,
  compileGlossary,
  findGlossaryMismatches,
  countOccurrences,
  countOccurrencesByCode,
  splitLeadingTrailingCodes,
  repairMissingCodes,
  canRepairMissingCodes,
  NON_LATIN_SCRIPT_RE,
  findNonLatinChars,
  NON_LATIN_MIN_CHARS,
  NON_LATIN_MIN_RATIO,
  nonLatinRatio,
  isWrongScript,
  describeChars,
  migrateQaIgnored,
  checkEntryIssues,
  makeTranslationFailedIssue,
  QA_DIAG_AMOSTRAS_POR_TIPO,
  QA_DIAG_MAX_TEXTO,
  cortaTexto,
  buildQaDiagnostic,
  runQualityCheck,
  selectBulkApprovableEntries,
  memoryKey,
  entryMatchesFilter,
  bytesToBase64,
  base64ToBytes,
  deriveAesKey,
  encryptApiKey,
  decryptApiKey,
  sleep,
  withExportProgress,
  translateViaLibreTranslate,
  translateViaMyMemory,
  buildAnthropicSystemBlocks,
  anthropicThinkingConfig,
  extractAnthropicText,
  translateViaAnthropic,
  isOpenAiReasoningModel,
  openAiReasoningEffortFor,
  isSmallOpenAiModel,
  hashStringToKey,
  reviewTextHash,
  OPENAI_CACHE_SHARDS,
  openAiCacheShardState,
  nextOpenAiCacheShard,
  openAiPromptCacheKey,
  buildOpenAiTuning,
  isOllamaNativeEnabled,
  ollamaNativeUrl,
  ollamaBatchSchema,
  ollamaReviewSchema,
  buildOllamaNativeBody,
  OLLAMA_JSON_PREFILL,
  buildOllamaNativeBody,
  extractOllamaNativeText,
  callOllamaNative,
  translateViaOpenAI,
  GOOGLE_SAFETY_SETTINGS,
  googleThinkingConfig,
  parseGoogleQuotaError,
  translateViaGoogle,
  enforceCompileCache,
  compileEnforceableGlossary,
  enforceFixedGlossaryTerms,
  translateViaLLM,
  translateBatchViaAnthropic,
  translateBatchViaOpenAI,
  translateBatchViaOllamaNative,
  translateBatchViaGoogle,
  translateBatchViaLLM,
  translateBatchWithRetry,
  translateTextOnce,
  translateText,
  parseWorkbookEntries,
  resolveProjectName,
  docsInProject,
  isDuplicateOpenFile,
  parseProgressStorageKey,
  validateProjectStateExport,
  isEditableSceneParamType,
  SCENE_OP_LABELS,
  sceneOpLabel,
  parseScenePointerTarget,
  parseSceneSheet,
  findSceneParam,
  validateSceneEdit,
  applySceneEditsToWorksheet,
  SCRIPT_FILE_ID_BASE,
  computeScriptFileId,
  detectLineEnding,
  findOpsEntryBoxes,
  opsEntryAttr,
  applyOpsAttrEdits,
  opsTextFromLines,
  cloneOpsEntryBoxLine,
  insertOpsLine,
  TBL_ITEM_GAP_AFTER_FLAG,
  tblFindCStringEnd,
  tblIsCleanText,
  parseItemTable,
  applyItemTableFieldEdit,
  tblBytesToBinaryString,
  tblFindTagPositions,
  tblReadRecordHeader,
  tblDecodeStringRange,
  tblRewriteLenField,
  applyTaggedTableFieldEdit,
  parsePlaceTable,
  parseNameTable,
  tblCleanFieldBounds,
  tblReadRecordHeaderGeneric,
  tblWalkRecordStrings,
  parseTaggedTableByProfile,
  TBL_TABLE_PROFILES,
  TBL_ITEM_DETECTION_MIN_RECORDS,
  detectTblProfile
};

if (typeof module === "object" && module.exports) {
  module.exports = TLoHCore;
}
if (typeof window !== "undefined") {
  window.TLoHCore = TLoHCore;
}
