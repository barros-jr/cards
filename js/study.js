/* =========================================================
   study.js — sessão de estudo (Revisão / Prática livre),
   direções de card (reconhecimento / produção), modos de
   resposta (ver / digitar / múltipla / ouvir), fila, painel
   e gravação no Supabase.

   Direções (metodologia):
   - 'rec'  = reconhecimento: vê o idioma (L2) → lembra o português.
   - 'prod' = produção: vê o português → produz o idioma (L2).
   Cada direção tem agendamento FSRS PRÓPRIO (linha própria em
   card_progress). Cards cloze têm só 'rec' (a lacuna já é produção).
   ========================================================= */

import { supabase } from "./supabase.js";
import { USUARIO_ID, TETO_CARDS_NOVOS } from "./config.js";
import * as srs from "./srs.js";
import { tocarCard, falar } from "./audio.js";
import { state, atualizar, el, icone, corIdioma } from "./state.js";

const UID = USUARIO_ID;

// Quais direções se aplicam a um card.
function direcoesDe(card) {
  return card.type === "cloze" ? ["rec"] : ["rec", "prod"];
}

/* ---------------- Dados (Supabase) ---------------- */

export async function carregarIdiomas() {
  const { data, error } = await supabase.from("cards").select("language");
  if (error) {
    console.warn("Erro ao listar idiomas:", error);
    return [];
  }
  return [...new Set((data || []).map((r) => r.language).filter(Boolean))].sort();
}

/* Seleção efetiva de idiomas: null = todos (nenhuma restrição). */
export function selecaoEfetiva() {
  const sel = state.idiomasSelecionados;
  if (!sel || !sel.length) return null;
  return sel;
}

/* Busca cards (dos idiomas selecionados) + progresso nas DUAS direções.
   selecao = array de códigos ou null (todos).
   Devolve [{ card, prog: { rec: linha|null, prod: linha|null } }]. */
async function buscarCardsComProgresso(selecao) {
  let consulta = supabase.from("cards").select("*");
  if (Array.isArray(selecao) && selecao.length) consulta = consulta.in("language", selecao);
  const { data: cards, error } = await consulta;
  if (error) {
    console.warn("Erro ao buscar cards:", error);
    return [];
  }
  const lista = cards || [];
  const ids = lista.map((c) => c.id);
  let progressos = [];
  if (ids.length) {
    const { data: prog, error: e2 } = await supabase
      .from("card_progress")
      .select("*")
      .eq("user_id", UID)
      .in("card_id", ids);
    if (e2) console.warn("Erro ao buscar progresso:", e2);
    progressos = prog || [];
  }
  const mapa = new Map(progressos.map((p) => [`${p.card_id}|${p.direcao || "rec"}`, p]));
  return lista.map((c) => ({
    card: c,
    prog: { rec: mapa.get(`${c.id}|rec`) || null, prod: mapa.get(`${c.id}|prod`) || null },
  }));
}

// Quantas "entradas" novas (card+direção) já foram introduzidas hoje.
async function contarNovosHoje() {
  const { count, error } = await supabase
    .from("card_progress")
    .select("id", { count: "exact", head: true })
    .eq("user_id", UID)
    .gte("created_at", inicioDeHojeISO())
    .gt("reps", 0);
  if (error) {
    console.warn("Erro ao contar novos de hoje:", error);
    return 0;
  }
  return count || 0;
}

/* Contagens da Home: monta o detalhe POR idioma (para as linhas
   selecionáveis) e os totais da seleção atual. Cada card+direção
   conta como uma entrada. */
export async function carregarContagens() {
  const lista = await buscarCardsComProgresso(null); // todos os idiomas
  const agora = new Date();

  const mapa = new Map(); // cod -> { idioma, total, dominados, due, novos }
  for (const x of lista) {
    const cod = x.card.language;
    if (!mapa.has(cod)) mapa.set(cod, { idioma: cod, total: 0, dominados: 0, due: 0, novos: 0 });
    const m = mapa.get(cod);
    m.total++;
    if (x.prog.rec && x.prog.rec.state === 2) m.dominados++;
    for (const dir of direcoesDe(x.card)) {
      const p = x.prog[dir];
      if (p && srs.estaVencido(p, agora)) m.due++;
      if (!p) m.novos++;
    }
  }
  const detalheIdiomas = [...mapa.values()].sort((a, b) => a.idioma.localeCompare(b.idioma));
  const idiomas = detalheIdiomas.map((d) => d.idioma);

  // Seleção: primeira carga = todos; depois, só códigos que ainda existem.
  let sel = state.idiomasSelecionados;
  if (!sel) sel = idiomas.slice();
  else sel = sel.filter((c) => idiomas.includes(c));

  const efetiva = new Set(sel.length ? sel : idiomas);
  let due = 0, novosDisponiveis = 0, totalSel = 0;
  for (const d of detalheIdiomas) {
    if (!efetiva.has(d.idioma)) continue;
    due += d.due;
    novosDisponiveis += d.novos;
    totalSel += d.total;
  }
  const introduzidos = await contarNovosHoje();
  const novos = Math.min(novosDisponiveis, Math.max(0, TETO_CARDS_NOVOS - introduzidos));
  const { streak, estudouHoje } = await resumoFoguinho();
  atualizar({
    idiomas,
    detalheIdiomas,
    idiomasSelecionados: sel,
    pendentes: { due, novos, total: due + novos },
    totalIdioma: totalSel,
    streak,
    estudouHoje,
  });
}

/* Dados do painel (gráfico da semana, números, palavra do dia). */
export async function carregarPainel() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const sete = new Date(hoje);
  sete.setDate(sete.getDate() - 6);
  const { data: ativ } = await supabase
    .from("daily_activity")
    .select("date,reviews_done")
    .eq("user_id", UID)
    .gte("date", dataLocalISO(sete));
  const mapa = new Map((ativ || []).map((r) => [r.date, r.reviews_done || 0]));
  const rotulos = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const semana = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    const key = dataLocalISO(d);
    semana.push({ date: key, label: rotulos[d.getDay()], count: mapa.get(key) || 0 });
  }

  const { count: total } = await supabase.from("cards").select("id", { count: "exact", head: true });
  // "Dominados" conta a direção de reconhecimento (comparável ao total de cards).
  const { count: dominados } = await supabase
    .from("card_progress")
    .select("id", { count: "exact", head: true })
    .eq("user_id", UID)
    .eq("state", 2)
    .eq("direcao", "rec");

  const { data: cards } = await supabase.from("cards").select("*").limit(1000);
  let palavraDia = null;
  if (cards && cards.length) {
    const sel = selecaoEfetiva();
    const pool = sel ? cards.filter((c) => sel.includes(c.language)) : cards;
    const lista2 = pool.length ? pool : cards;
    const dia = Math.floor((hoje - new Date(hoje.getFullYear(), 0, 0)) / 86400000);
    palavraDia = lista2[dia % lista2.length];
  }

  atualizar({ semana, stats: { total: total || 0, dominados: dominados || 0 }, palavraDia });
}

/* Fila: itens = { card, direcao, progresso, novo }. */
async function montarFila(selecao, modo, { soDificeis = false } = {}) {
  const lista = await buscarCardsComProgresso(selecao);

  if (modo === "pratica") {
    // Prática livre: só reconhecimento (navegação leve), embaralhado.
    let arr = lista.map((x) => ({ card: x.card, direcao: "rec", progresso: x.prog.rec, novo: !x.prog.rec }));
    if (soDificeis) arr = arr.filter((i) => i.progresso && i.progresso.dificil);
    embaralhar(arr);
    return arr;
  }

  // Revisão: vencidos (por due) + novos até o teto (rec antes de prod por card).
  const agora = new Date();
  let vencidos = [];
  let candidatosNovos = [];
  for (const x of lista) {
    for (const dir of direcoesDe(x.card)) {
      const p = x.prog[dir];
      const item = { card: x.card, direcao: dir, progresso: p, novo: !p };
      if (p && srs.estaVencido(p, agora)) vencidos.push(item);
      if (!p) candidatosNovos.push(item);
    }
  }
  if (soDificeis) {
    vencidos = vencidos.filter((i) => i.progresso && i.progresso.dificil);
    candidatosNovos = [];
  }
  vencidos.sort((a, b) => new Date(a.progresso.due) - new Date(b.progresso.due));
  // novos: ordena por criação do card; 'rec' entra antes de 'prod' do mesmo card
  candidatosNovos.sort((a, b) => {
    const t = new Date(a.card.created_at) - new Date(b.card.created_at);
    if (t !== 0) return t;
    return a.direcao === b.direcao ? 0 : a.direcao === "rec" ? -1 : 1;
  });
  const introduzidos = await contarNovosHoje();
  const permitido = Math.max(0, TETO_CARDS_NOVOS - introduzidos);
  return [...vencidos, ...candidatosNovos.slice(0, permitido)];
}

export async function gravarAvaliacao(item, nota) {
  const agora = new Date();
  const atual = item.progresso || srs.progressoNovo(agora);
  const novo = srs.avaliar(atual, nota, agora);
  const linha = {
    user_id: UID,
    card_id: item.card.id,
    direcao: item.direcao || "rec",
    ...novo,
    updated_at: agora.toISOString(),
  };
  if (!item.progresso) linha.created_at = agora.toISOString();
  const { error } = await supabase
    .from("card_progress")
    .upsert(linha, { onConflict: "user_id,card_id,direcao" });
  if (error) {
    console.warn("Erro ao gravar progresso:", error);
    return;
  }
  await registrarAtividade(agora);
}

async function registrarAtividade(agora) {
  const hoje = dataLocalISO(agora);
  const { data } = await supabase
    .from("daily_activity")
    .select("id,reviews_done")
    .eq("user_id", UID)
    .eq("date", hoje)
    .maybeSingle();
  if (data) {
    await supabase.from("daily_activity").update({ reviews_done: (data.reviews_done || 0) + 1 }).eq("id", data.id);
  } else {
    await supabase.from("daily_activity").insert({ user_id: UID, date: hoje, reviews_done: 1 });
  }
}

async function resumoFoguinho() {
  const { data, error } = await supabase
    .from("daily_activity")
    .select("date,reviews_done")
    .eq("user_id", UID)
    .order("date", { ascending: false })
    .limit(400);
  if (error || !data || !data.length) return { streak: 0, estudouHoje: false };
  const dias = new Set(data.filter((r) => (r.reviews_done || 0) > 0).map((r) => r.date));
  const estudouHoje = dias.has(dataLocalISO(new Date()));
  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (!estudouHoje) d.setDate(d.getDate() - 1);
  while (dias.has(dataLocalISO(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return { streak, estudouHoje };
}

/* ---------------- Sessão (controle) ---------------- */

export async function iniciarSessao(selecao, modo, extra = {}) {
  if (selecao == null) selecao = selecaoEfetiva();
  const modoResposta = extra.modoResposta || state.modoResposta || "ver";
  const soDificeis = extra.soDificeis ?? state.soDificeis;
  atualizar({
    rota: "estudo",
    sessao: {
      modo,
      selecao,
      modoResposta,
      soDificeis,
      fila: [],
      indice: 0,
      revelado: false,
      previsao: null,
      opcoes: [],
      digitado: "",
      escolhida: null,
      acertou: null,
      carregando: true,
    },
  });
  const fila = await montarFila(selecao, modo, { soDificeis });
  const sessao = { ...state.sessao, fila, carregando: false };
  prepararCard(sessao);
  atualizar({ sessao });
}

function prepararCard(sessao) {
  sessao.revelado = false;
  sessao.previsao = null;
  sessao.digitado = "";
  sessao.escolhida = null;
  sessao.acertou = null;
  sessao.opcoes = [];
  const item = sessao.fila[sessao.indice];
  if (item && item.card.type !== "cloze" && sessao.modoResposta === "multipla") {
    sessao.opcoes = gerarOpcoes(item, sessao.fila);
  }
}

function revelar(acertou = null) {
  const s = state.sessao;
  const item = s.fila[s.indice];
  const previsao = s.modo === "revisao" ? srs.previsao(item.progresso || srs.progressoNovo(), new Date()) : null;
  atualizar({ sessao: { ...s, revelado: true, previsao, acertou } });
}

function verificarDigitado() {
  const inp = document.querySelector("#resp-digitar");
  if (!inp) return;
  const s = state.sessao;
  const item = s.fila[s.indice];
  const digitado = inp.value;
  const acertou = conferir(item.card, digitado, item.direcao);
  const previsao = s.modo === "revisao" ? srs.previsao(item.progresso || srs.progressoNovo(), new Date()) : null;
  atualizar({ sessao: { ...s, digitado, acertou, revelado: true, previsao } });
}

function escolher(opcao) {
  const s = state.sessao;
  const item = s.fila[s.indice];
  const acertou = normalizar(opcao) === normalizar(respostaAlvo(item.card, item.direcao));
  const previsao = s.modo === "revisao" ? srs.previsao(item.progresso || srs.progressoNovo(), new Date()) : null;
  atualizar({ sessao: { ...s, escolhida: opcao, acertou, revelado: true, previsao } });
}

async function avaliar(chave) {
  const s = state.sessao;
  const item = s.fila[s.indice];
  const ultimo = s.indice + 1 >= s.fila.length;
  const gravacao = gravarAvaliacao(item, srs.NOTAS[chave]);
  if (ultimo && s.modo === "revisao") await gravacao;
  avancar();
}

function avancar() {
  const s = state.sessao;
  const novo = { ...s, indice: s.indice + 1 };
  prepararCard(novo);
  atualizar({ sessao: novo });
  if (novo.indice >= s.fila.length && s.modo === "revisao" && s.fila.length > 0) carregarContagens();
}

async function toggleDificil() {
  const s = state.sessao;
  const item = s.fila[s.indice];
  const novoValor = !(item.progresso && item.progresso.dificil);
  if (item.progresso) {
    const { error } = await supabase
      .from("card_progress")
      .update({ dificil: novoValor })
      .eq("user_id", UID)
      .eq("card_id", item.card.id)
      .eq("direcao", item.direcao || "rec");
    if (error) return console.warn(error);
    item.progresso.dificil = novoValor;
  } else {
    const agora = new Date();
    const linha = {
      user_id: UID,
      card_id: item.card.id,
      direcao: item.direcao || "rec",
      ...srs.progressoNovo(agora),
      dificil: novoValor,
      created_at: agora.toISOString(),
      updated_at: agora.toISOString(),
    };
    const { data, error } = await supabase.from("card_progress").insert(linha).select().single();
    if (error) return console.warn(error);
    item.progresso = data;
  }
  atualizar({ sessao: { ...state.sessao } });
}

async function sairSessao() {
  atualizar({ rota: "home", sessao: null });
  await carregarContagens();
  await carregarPainel();
}

/* ---------------- Sessão (tela) ---------------- */

export function renderEstudo(raiz) {
  const s = state.sessao;
  const barra = el("header", { classe: "barra-topo barra-topo--sessao" }, [
    el("button", { classe: "btn-voltar", "aria-label": "Voltar", onclick: sairSessao }, [icone("arrow-left")]),
    el("span", { classe: "barra-topo__titulo", texto: s.modo === "revisao" ? "Revisão" : "Prática livre" }),
    el("span", {
      classe: "sessao-progresso",
      texto: !s.carregando && s.fila.length ? `${Math.min(s.indice + 1, s.fila.length)}/${s.fila.length}` : "",
    }),
  ]);

  const conteudo = el("main", { classe: "conteudo conteudo--sessao" });

  if (s.carregando) {
    conteudo.append(el("p", { classe: "texto-suave centro", texto: "Montando a sessão…" }));
    raiz.replaceChildren(barra, conteudo);
    return;
  }
  if (s.indice >= s.fila.length) {
    conteudo.append(telaConclusao());
    raiz.replaceChildren(barra, conteudo);
    return;
  }

  const prog = el("div", { classe: "barra-progresso" }, [el("div", { classe: "barra-progresso__cheio" })]);
  prog.firstChild.style.width = `${(s.indice / s.fila.length) * 100}%`;

  conteudo.append(prog, cartaoCard(s.fila[s.indice], s), areaAcao(s));
  raiz.replaceChildren(barra, conteudo);
}

// Modo efetivo do card atual: cloze e casos degenerados caem para "ver".
function modoDoCard(s) {
  const item = s.fila[s.indice];
  if (!item || item.card.type === "cloze") return "ver";
  if (s.modoResposta === "ouvir" && item.direcao === "prod") return "ver"; // ouvir só faz sentido no reconhecimento
  if (s.modoResposta === "multipla" && (s.opcoes || []).length < 2) return "ver";
  return s.modoResposta;
}

function cartaoCard(item, s) {
  const card = item.card;
  const modo = modoDoCard(s);
  const prod = item.direcao === "prod";
  const c = el("section", { classe: "flashcard" });
  c.append(
    el("span", { classe: "flashcard__idioma" }, [
      el("span", { classe: "flashcard__idioma-dot", style: `background:${corIdioma(card.language)}` }),
      nomeIdioma(card.language),
    ])
  );
  if (prod) {
    c.append(el("span", { classe: "flashcard__direcao" }, [icone("pencil"), " produção"]));
  }

  // Frente/verso conforme a direção:
  // rec : frente = L2 (card.front) → resposta = PT (card.back)
  // prod: frente = PT (card.back)  → resposta = L2 (card.front)
  const frenteTexto = card.type === "cloze" ? frenteCloze(card.cloze_text || "") : prod ? card.back || "" : card.front || "";
  const respostaTexto = prod ? card.front || "" : card.back || "";

  if (!s.revelado) {
    if (modo === "ouvir") {
      c.append(
        el("button", { classe: "btn-audio btn-audio--grande", "aria-label": "Ouvir", onclick: () => tocarCard(card) }, [icone("volume")])
      );
      c.append(el("div", { classe: "texto-suave", texto: "toque para ouvir e tente lembrar" }));
    } else {
      c.append(el("div", { classe: "flashcard__frente", texto: frenteTexto }));
    }
  } else if (card.type === "cloze") {
    c.append(el("div", { classe: "flashcard__resposta" }, nosClozeRevelado(card.cloze_text || "")));
    if (card.back) c.append(el("div", { classe: "flashcard__traducao texto-suave", texto: card.back }));
  } else {
    c.append(el("div", { classe: "flashcard__frente-peq texto-suave", texto: frenteTexto }));
    c.append(el("div", { classe: "divisor" }));
    c.append(el("div", { classe: "flashcard__resposta", texto: respostaTexto }));
    if (card.example) {
      c.append(
        el("div", { classe: "flashcard__exemplo" }, [
          el("span", { classe: "flashcard__exemplo-texto", texto: card.example }),
          el("button", { classe: "btn-audio-mini", "aria-label": "Ouvir frase", onclick: () => falar(card.example, card.tts_lang || card.language) }, [icone("volume-2")]),
        ])
      );
    }
  }

  if (s.revelado && s.acertou !== null) {
    if (s.acertou) {
      c.append(el("div", { classe: "feedback feedback--ok" }, [icone("check"), "Você acertou!"]));
    } else {
      const sua = s.modoResposta === "digitar" ? s.digitado : s.escolhida;
      c.append(el("div", { classe: "feedback feedback--erro" }, [icone("x"), `Sua resposta: ${sua || "(vazia)"}`]));
    }
  }

  // No modo Ouvir (antes de revelar), o botão grande já é o áudio — sem duplicar.
  if (!s.revelado && modo === "ouvir") return c;

  const acoesCard = el("div", { classe: "flashcard__acoes" }, [
    el("button", { classe: "btn-audio", "aria-label": "Ouvir pronúncia", onclick: () => tocarCard(card) }, [icone("volume")]),
  ]);
  if (s.revelado) {
    const marcado = item.progresso && item.progresso.dificil;
    acoesCard.append(
      el("button", { classe: `btn-dificil ${marcado ? "marcado" : ""}`, "aria-label": "Marcar como difícil", title: "Marcar como difícil", onclick: toggleDificil }, [
        icone(marcado ? "star-filled" : "star"),
      ])
    );
  }
  c.append(acoesCard);
  return c;
}

function areaAcao(s) {
  const wrap = el("div", { classe: "area-acao" });
  const item = s.fila[s.indice];
  const modo = modoDoCard(s);

  if (!s.revelado) {
    if (modo === "digitar") {
      const placeholder = item.direcao === "prod" ? `Escreva em ${nomeIdioma(item.card.language).toLowerCase()}…` : "Escreva a tradução…";
      const inp = el("input", { classe: "campo resp-digitar", id: "resp-digitar", type: "text", placeholder, autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
      inp.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") verificarDigitado();
      });
      wrap.append(inp);
      wrap.append(el("button", { classe: "btn btn-primario", onclick: verificarDigitado, texto: "Verificar" }));
    } else if (modo === "multipla") {
      const grade = el("div", { classe: "opcoes" });
      for (const op of s.opcoes) grade.append(el("button", { classe: "opcao", onclick: () => escolher(op), texto: op }));
      wrap.append(grade);
    } else {
      wrap.append(el("button", { classe: "btn btn-primario", onclick: () => revelar() }, [icone("eye"), " Mostrar resposta"]));
    }
    return wrap;
  }

  if (s.modo === "pratica") {
    wrap.append(el("button", { classe: "btn btn-primario", onclick: avancar, texto: "Próximo" }));
    return wrap;
  }

  const grade = el("div", { classe: "notas" });
  const defs = [
    ["ERREI", "nota-errei"],
    ["DIFICIL", "nota-dificil"],
    ["BOM", "nota-bom"],
    ["FACIL", "nota-facil"],
  ];
  for (const [chave, cls] of defs) {
    const intervalo = s.previsao ? s.previsao[chave].intervaloTexto : "";
    grade.append(
      el("button", { classe: `nota ${cls}`, onclick: () => avaliar(chave) }, [
        el("span", { classe: "nota__rotulo", texto: srs.ROTULOS_NOTA[chave] }),
        el("span", { classe: "nota__intervalo", texto: intervalo }),
      ])
    );
  }
  wrap.append(grade);
  return wrap;
}

function telaConclusao() {
  const s = state.sessao;
  const vazio = s.fila.length === 0;
  const c = el("section", { classe: "cartao conclusao" });

  if (!vazio && s.modo === "revisao") {
    c.append(el("div", { classe: "conclusao__emoji foguinho-anim" }, [icone("flame")]));
    c.append(el("h2", { classe: "titulo-secao", texto: "Dia concluído!" }));
    c.append(el("p", { classe: "conclusao__streak", texto: `Sequência de ${state.streak} ${state.streak === 1 ? "dia" : "dias"}` }));
    c.append(el("p", { classe: "texto-suave", texto: `Você revisou ${s.fila.length} card(s).` }));
  } else {
    c.append(el("div", { classe: "conclusao__emoji" }, [icone(vazio ? "confetti" : "circle-check")]));
    c.append(
      el("h2", {
        classe: "titulo-secao",
        texto: vazio ? (s.soDificeis ? "Nenhum card difícil por aqui" : s.modo === "revisao" ? "Nada para revisar agora!" : "Nenhum card aqui ainda") : "Sessão concluída!",
      })
    );
  }
  c.append(el("button", { classe: "btn btn-primario", onclick: sairSessao, texto: "Voltar para o início" }));
  return c;
}

/* ---------------- Modos de resposta (ajudantes) ---------------- */

/* Resposta "alvo" conforme a direção:
   rec  → o português (back) ou o conteúdo da lacuna (cloze);
   prod → a palavra no idioma (front). */
export function respostaAlvo(card, direcao = "rec") {
  if (card.type === "cloze") {
    const achados = (card.cloze_text || "").match(/\[([^\]]*)\]/g);
    if (achados && achados.length) return achados.map((s) => s.slice(1, -1)).join(" ");
    return "";
  }
  return (direcao === "prod" ? card.front : card.back) || "";
}

// Normaliza para comparar: minúsculas, sem acentos, sem pontuação.
export function normalizar(t) {
  return (t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,!?;:¿¡"()]/g, "")
    .replace(/[-'´`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Artigos que podem ser OMITIDOS (mas não trocados) na resposta digitada.
const RE_ARTIGO = /^(o|a|os|as|um|uma|el|la|los|las|le|les|der|die|das|lo|the|un|une|il|i|gli|un')\s+/;
function semArtigo(s) {
  return s.replace(RE_ARTIGO, "");
}

/* Confere a resposta digitada (sinônimos por / ou ;). Tolera artigo
   AUSENTE ("casa" = "a casa"), mas rejeita artigo TROCADO. */
export function conferir(card, texto, direcao = "rec") {
  const d = normalizar(texto);
  if (!d) return false;
  const dSem = semArtigo(d);
  const dTemArtigo = RE_ARTIGO.test(d);
  const alternativas = respostaAlvo(card, direcao).split(/[/;]/).map(normalizar).filter(Boolean);
  for (const alvo of alternativas) {
    if (d === alvo) return true;
    if (dSem === semArtigo(alvo) && (!dTemArtigo || !RE_ARTIGO.test(alvo))) return true;
  }
  return false;
}

/* Opções da múltipla escolha: correta + até 3 distratores, preferindo
   cards do MESMO idioma (importante em sessões multi-idioma). */
function gerarOpcoes(item, fila) {
  const correta = respostaAlvo(item.card, item.direcao);
  const vistos = new Set([normalizar(correta)]);
  const mesmoIdioma = [];
  const outros = [];
  for (const x of fila) {
    if (x.card.id === item.card.id) continue;
    const r = respostaAlvo(x.card, item.direcao);
    const k = normalizar(r);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    (x.card.language === item.card.language ? mesmoIdioma : outros).push(r);
  }
  embaralhar(mesmoIdioma);
  embaralhar(outros);
  const opcoes = [correta, ...[...mesmoIdioma, ...outros].slice(0, 3)];
  embaralhar(opcoes);
  return opcoes;
}

/* ---------------- Ajudantes gerais ---------------- */

export function nomeIdioma(cod) {
  const nomes = { es: "Espanhol", en: "Inglês", fr: "Francês", it: "Italiano", de: "Alemão", pt: "Português" };
  return nomes[cod] || cod;
}

function frenteCloze(texto) {
  return texto.replace(/\[[^\]]*\]/g, "[ … ]");
}

function nosClozeRevelado(texto) {
  const partes = [];
  const regex = /\[([^\]]*)\]/g;
  let ultimo = 0;
  let m;
  while ((m = regex.exec(texto))) {
    if (m.index > ultimo) partes.push(document.createTextNode(texto.slice(ultimo, m.index)));
    partes.push(el("span", { classe: "cloze-resp", texto: m[1] }));
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) partes.push(document.createTextNode(texto.slice(ultimo)));
  return partes;
}

function inicioDeHojeISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function dataLocalISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function embaralhar(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}
