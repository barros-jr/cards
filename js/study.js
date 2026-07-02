/* =========================================================
   study.js — sessão de estudo (Revisão / Prática livre),
   modos de resposta (ver / digitar / múltipla escolha),
   montagem da fila, dados do painel e gravação no Supabase.
   ========================================================= */

import { supabase } from "./supabase.js";
import { USUARIO_ID, TETO_CARDS_NOVOS } from "./config.js";
import * as srs from "./srs.js";
import { tocarCard } from "./audio.js";
import { state, atualizar, el, icone } from "./state.js";

const UID = USUARIO_ID;

/* ---------------- Dados (Supabase) ---------------- */

export async function carregarIdiomas() {
  const { data, error } = await supabase.from("cards").select("language");
  if (error) {
    console.warn("Erro ao listar idiomas:", error);
    return [];
  }
  return [...new Set((data || []).map((r) => r.language).filter(Boolean))].sort();
}

async function buscarCardsComProgresso(idioma) {
  let consulta = supabase.from("cards").select("*");
  if (idioma && idioma !== "todos") consulta = consulta.eq("language", idioma);
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
  const mapa = new Map(progressos.map((p) => [p.card_id, p]));
  return lista.map((c) => ({ card: c, progresso: mapa.get(c.id) || null }));
}

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

/* Contagens da Home (pendentes do idioma atual + foguinho). */
export async function carregarContagens() {
  const lista = await buscarCardsComProgresso(state.idioma);
  const agora = new Date();
  const due = lista.filter((x) => x.progresso && srs.estaVencido(x.progresso, agora)).length;
  const novosDisponiveis = lista.filter((x) => !x.progresso).length;
  const introduzidos = await contarNovosHoje();
  const novos = Math.min(novosDisponiveis, Math.max(0, TETO_CARDS_NOVOS - introduzidos));
  const { streak, estudouHoje } = await resumoFoguinho();
  atualizar({
    pendentes: { due, novos, total: due + novos },
    totalIdioma: lista.length,
    streak,
    estudouHoje,
  });
}

/* Dados do painel: gráfico da semana, números e palavra do dia. */
export async function carregarPainel() {
  // Gráfico "Sua semana" (últimos 7 dias).
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

  // Números: total de cards e quantos já estão "dominados" (state Review).
  const { count: total } = await supabase.from("cards").select("id", { count: "exact", head: true });
  const { count: dominados } = await supabase
    .from("card_progress")
    .select("id", { count: "exact", head: true })
    .eq("user_id", UID)
    .eq("state", 2);

  // Palavra do dia: um card escolhido de forma estável pela data.
  const { data: cards } = await supabase.from("cards").select("*").limit(1000);
  let palavraDia = null;
  if (cards && cards.length) {
    const dia = Math.floor((hoje - new Date(hoje.getFullYear(), 0, 0)) / 86400000);
    palavraDia = cards[dia % cards.length];
  }

  atualizar({ semana, stats: { total: total || 0, dominados: dominados || 0 }, palavraDia });
}

// Monta a fila conforme o modo (e o filtro "só difíceis").
async function montarFila(idioma, modo, { soDificeis = false } = {}) {
  let lista = await buscarCardsComProgresso(idioma);
  if (soDificeis) lista = lista.filter((x) => x.progresso && x.progresso.dificil);

  if (modo === "pratica") {
    const arr = lista.slice();
    embaralhar(arr);
    return arr.map((x) => ({ card: x.card, progresso: x.progresso, novo: !x.progresso }));
  }

  const agora = new Date();
  const vencidos = lista
    .filter((x) => x.progresso && srs.estaVencido(x.progresso, agora))
    .sort((a, b) => new Date(a.progresso.due) - new Date(b.progresso.due));
  const introduzidos = await contarNovosHoje();
  const permitido = Math.max(0, TETO_CARDS_NOVOS - introduzidos);
  const novos = lista.filter((x) => !x.progresso).slice(0, permitido);
  return [...vencidos, ...novos].map((x) => ({ card: x.card, progresso: x.progresso, novo: !x.progresso }));
}

export async function gravarAvaliacao(item, nota) {
  const agora = new Date();
  const atual = item.progresso || srs.progressoNovo(agora);
  const novo = srs.avaliar(atual, nota, agora);
  const linha = { user_id: UID, card_id: item.card.id, ...novo, updated_at: agora.toISOString() };
  if (!item.progresso) linha.created_at = agora.toISOString();
  const { error } = await supabase.from("card_progress").upsert(linha, { onConflict: "user_id,card_id" });
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

export async function iniciarSessao(idioma, modo, extra = {}) {
  const modoResposta = extra.modoResposta || state.modoResposta || "ver";
  const soDificeis = extra.soDificeis ?? state.soDificeis;
  atualizar({
    rota: "estudo",
    sessao: {
      modo,
      idioma,
      modoResposta,
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
  const fila = await montarFila(idioma, modo, { soDificeis });
  const sessao = { ...state.sessao, fila, carregando: false };
  prepararCard(sessao);
  atualizar({ sessao });
}

// Prepara o card atual (gera opções da múltipla escolha, zera respostas).
function prepararCard(sessao) {
  sessao.revelado = false;
  sessao.previsao = null;
  sessao.digitado = "";
  sessao.escolhida = null;
  sessao.acertou = null;
  sessao.opcoes = [];
  const item = sessao.fila[sessao.indice];
  if (item && item.card.type !== "cloze" && sessao.modoResposta === "multipla") sessao.opcoes = gerarOpcoes(item, sessao.fila);
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
  const acertou = conferir(item.card, digitado);
  const previsao = s.modo === "revisao" ? srs.previsao(item.progresso || srs.progressoNovo(), new Date()) : null;
  atualizar({ sessao: { ...s, digitado, acertou, revelado: true, previsao } });
}

function escolher(opcao) {
  const s = state.sessao;
  const item = s.fila[s.indice];
  const acertou = normalizar(opcao) === normalizar(respostaAlvo(item.card));
  const previsao = s.modo === "revisao" ? srs.previsao(item.progresso || srs.progressoNovo(), new Date()) : null;
  atualizar({ sessao: { ...s, escolhida: opcao, acertou, revelado: true, previsao } });
}

function avaliar(chave) {
  const s = state.sessao;
  const item = s.fila[s.indice];
  const ultimo = s.indice + 1 >= s.fila.length;
  const gravacao = gravarAvaliacao(item, srs.NOTAS[chave]);
  if (ultimo && s.modo === "revisao") return gravacao.then(avancar);
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
      .eq("card_id", item.card.id);
    if (error) return console.warn(error);
    item.progresso.dificil = novoValor;
  } else {
    const agora = new Date();
    const linha = { user_id: UID, card_id: item.card.id, ...srs.progressoNovo(agora), dificil: novoValor, created_at: agora.toISOString(), updated_at: agora.toISOString() };
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
    el("span", { classe: "barra-topo__titulo", texto: tituloSessao(s) }),
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

function tituloSessao(s) {
  if (s.modo === "pratica") return "Prática livre";
  return "Revisão";
}

function cartaoCard(item, s) {
  const card = item.card;
  const c = el("section", { classe: "flashcard" });
  c.append(el("span", { classe: "flashcard__idioma", texto: nomeIdioma(card.language) }));

  const frenteTexto = card.type === "cloze" ? frenteCloze(card.cloze_text || "") : card.front || "";

  if (!s.revelado) {
    c.append(el("div", { classe: "flashcard__frente", texto: frenteTexto }));
  } else if (card.type === "cloze") {
    c.append(el("div", { classe: "flashcard__resposta" }, nosClozeRevelado(card.cloze_text || "")));
    if (card.back) c.append(el("div", { classe: "flashcard__traducao texto-suave", texto: card.back }));
  } else {
    c.append(el("div", { classe: "flashcard__frente-peq texto-suave", texto: frenteTexto }));
    c.append(el("div", { classe: "divisor" }));
    c.append(el("div", { classe: "flashcard__resposta", texto: card.back || "" }));
  }

  // Feedback de acerto (digitar / múltipla escolha)
  if (s.revelado && s.acertou !== null) {
    if (s.acertou) {
      c.append(el("div", { classe: "feedback feedback--ok" }, [icone("check"), "Você acertou!"]));
    } else {
      const sua = s.modoResposta === "digitar" ? s.digitado : s.escolhida;
      c.append(el("div", { classe: "feedback feedback--erro" }, [icone("x"), `Sua resposta: ${sua || "(vazia)"}`]));
    }
  }

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

// Modo efetivo do card atual: cloze e múltipla-sem-opções-suficientes caem para "ver".
function modoDoCard(s) {
  const item = s.fila[s.indice];
  if (!item || item.card.type === "cloze") return "ver";
  if (s.modoResposta === "multipla" && (s.opcoes || []).length < 2) return "ver";
  return s.modoResposta;
}

function areaAcao(s) {
  const wrap = el("div", { classe: "area-acao" });
  const modo = modoDoCard(s);

  if (!s.revelado) {
    if (modo === "digitar") {
      const inp = el("input", { classe: "campo resp-digitar", id: "resp-digitar", type: "text", placeholder: "Escreva a resposta…", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
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

// Resposta "alvo" de um card: verso (básico) ou palavra da lacuna (cloze).
export function respostaAlvo(card) {
  if (card.type === "cloze") {
    const achados = (card.cloze_text || "").match(/\[([^\]]*)\]/g);
    if (achados && achados.length) return achados.map((s) => s.slice(1, -1)).join(" ");
  }
  return card.back || "";
}

// Normaliza para comparar: minúsculas, sem acentos, sem pontuação, sem artigos.
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
const RE_ARTIGO = /^(o|a|os|as|um|uma|el|la|los|las|le|les|der|die|das|lo)\s+/;
function semArtigo(s) {
  return s.replace(RE_ARTIGO, "");
}

/* Confere a resposta digitada. Aceita sinônimos (separados por / ou ;) e
   tolera o artigo AUSENTE ("casa" = "a casa"), mas NÃO o artigo TROCADO
   ("o casa" ≠ "a casa") — importante num app de idiomas. */
export function conferir(card, texto) {
  const d = normalizar(texto);
  if (!d) return false;
  const dSem = semArtigo(d);
  const dTemArtigo = RE_ARTIGO.test(d);
  const alternativas = respostaAlvo(card).split(/[/;]/).map(normalizar).filter(Boolean);
  for (const alvo of alternativas) {
    if (d === alvo) return true; // igual, incluindo o artigo
    if (dSem === semArtigo(alvo) && (!dTemArtigo || !RE_ARTIGO.test(alvo))) return true; // artigo só omitido
  }
  return false;
}

// Gera as 4 opções (correta + até 3 distratores de outros cards).
function gerarOpcoes(item, fila) {
  const correta = respostaAlvo(item.card);
  const chaveCorreta = normalizar(correta);
  const pool = [];
  const vistos = new Set([chaveCorreta]);
  for (const x of fila) {
    const r = respostaAlvo(x.card);
    const k = normalizar(r);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    pool.push(r);
  }
  embaralhar(pool);
  const opcoes = [correta, ...pool.slice(0, 3)];
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
