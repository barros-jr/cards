/* =========================================================
   library.js — Biblioteca
   Navegação idioma → deck → card, com busca por texto.
   Carrega todos os cards uma vez e navega/filtra no cliente
   (rápido, sem bater no banco a cada toque).
   ========================================================= */

import { supabase } from "./supabase.js";
import { state, atualizar, el, icone } from "./state.js";
import { nomeIdioma } from "./study.js";
import { abrirEditor } from "./cards.js";

function bibPadrao() {
  return { nivel: "idiomas", idioma: null, deckId: null, deckNome: null, busca: "", todos: [], carregando: true };
}

// Entrar na Biblioteca (pela barrinha de baixo): volta para o topo (idiomas).
export async function irParaBiblioteca() {
  state.bib = bibPadrao();
  await carregarTodos();
}

// Recarregar mantendo o nível atual (após criar/editar/excluir um card).
export async function recarregarBiblioteca() {
  if (!state.bib) state.bib = bibPadrao();
  await carregarTodos();
}

async function carregarTodos() {
  atualizar({ rota: "biblioteca", editor: null, bib: { ...state.bib, carregando: true } });
  const { data, error } = await supabase
    .from("cards")
    .select("*, decks(id,name,language)")
    .order("created_at");
  if (error) console.warn("Erro ao carregar a biblioteca:", error);
  atualizar({ bib: { ...state.bib, todos: data || [], carregando: false } });
}

/* ---------------- Navegação ---------------- */

function abrirIdioma(cod) {
  atualizar({ bib: { ...state.bib, nivel: "decks", idioma: cod, busca: "" } });
}
function abrirDeck(id, nome) {
  atualizar({ bib: { ...state.bib, nivel: "cards", deckId: id, deckNome: nome, busca: "" } });
}
function voltar() {
  const b = state.bib;
  if (b.busca) return atualizar({ bib: { ...b, busca: "" } });
  if (b.nivel === "cards") return atualizar({ bib: { ...b, nivel: "decks", deckId: null, deckNome: null } });
  if (b.nivel === "decks") return atualizar({ bib: { ...b, nivel: "idiomas", idioma: null } });
}
function aoBuscar(valor) {
  state.bib.busca = valor;
  atualizar();
}

/* ---------------- Tela (retorna [barra, main]) ---------------- */

export function construirBiblioteca() {
  const b = state.bib || bibPadrao();
  const mostrarVoltar = b.busca || b.nivel !== "idiomas";

  const barra = el("header", { classe: "barra-topo barra-topo--bib" }, [
    mostrarVoltar
      ? el("button", { classe: "btn-voltar", "aria-label": "Voltar", onclick: voltar }, [icone("arrow-left")])
      : el("span", { classe: "btn-voltar-placeholder" }),
    el("span", { classe: "barra-topo__titulo", texto: tituloNivel(b) }),
    el("span", { classe: "btn-voltar-placeholder" }),
  ]);

  const main = el("main", { classe: "conteudo" });

  main.append(
    el("input", {
      classe: "campo-busca",
      id: "bib-busca",
      type: "search",
      placeholder: "Buscar card…",
      value: b.busca,
      oninput: (ev) => aoBuscar(ev.target.value),
    })
  );

  if (b.carregando) {
    main.append(el("p", { classe: "texto-suave centro", texto: "Carregando…" }));
  } else {
    main.append(
      b.busca
        ? listaCards(filtrarBusca(b))
        : b.nivel === "idiomas"
        ? listaIdiomas(b)
        : b.nivel === "decks"
        ? listaDecks(b)
        : listaCards(b.todos.filter((c) => c.deck_id === b.deckId))
    );
  }

  main.append(
    el("button", { classe: "btn btn-primario btn-criar", onclick: () => abrirEditor(null, ctxCriar(b)) }, [icone("plus"), " Criar card"])
  );

  return [barra, main];
}

function listaIdiomas(b) {
  const contagem = new Map();
  for (const c of b.todos) contagem.set(c.language, (contagem.get(c.language) || 0) + 1);
  const wrap = el("div", { classe: "lista" });
  if (!contagem.size) wrap.append(vazio("Nenhum card ainda. Crie o primeiro! 👇"));
  for (const [cod, n] of [...contagem].sort()) {
    wrap.append(item(nomeIdioma(cod), `${n} card(s)`, () => abrirIdioma(cod)));
  }
  return wrap;
}

function listaDecks(b) {
  const decks = new Map();
  for (const c of b.todos) {
    if (c.language !== b.idioma) continue;
    const id = c.deck_id;
    const info = decks.get(id) || { nome: c.decks?.name || "(sem baralho)", n: 0 };
    info.n++;
    decks.set(id, info);
  }
  const wrap = el("div", { classe: "lista" });
  if (!decks.size) wrap.append(vazio("Nenhum baralho neste idioma."));
  for (const [id, info] of decks) wrap.append(item(info.nome, `${info.n} card(s)`, () => abrirDeck(id, info.nome)));
  return wrap;
}

function listaCards(cards) {
  const wrap = el("div", { classe: "lista" });
  if (!cards.length) {
    wrap.append(vazio("Nenhum card encontrado."));
    return wrap;
  }
  for (const c of cards) {
    const titulo = c.type === "cloze" ? (c.cloze_text || "").replace(/\[[^\]]*\]/g, "[…]") : c.front || "";
    const sub = c.type === "cloze" ? "cloze" : c.back || "";
    wrap.append(item(titulo, sub, () => abrirEditor(c)));
  }
  return wrap;
}

function filtrarBusca(b) {
  const t = b.busca.trim().toLowerCase();
  return b.todos.filter(
    (c) =>
      (c.front || "").toLowerCase().includes(t) ||
      (c.back || "").toLowerCase().includes(t) ||
      (c.cloze_text || "").toLowerCase().includes(t)
  );
}

function item(titulo, sub, onclick) {
  return el("button", { classe: "item-lista", onclick }, [
    el("div", { classe: "item-lista__texto" }, [
      el("div", { classe: "item-lista__titulo", texto: titulo }),
      sub ? el("div", { classe: "item-lista__sub texto-suave", texto: sub }) : null,
    ]),
    el("span", { classe: "item-lista__seta" }, [icone("chevron-right")]),
  ]);
}

function vazio(txt) {
  return el("p", { classe: "texto-suave centro", texto: txt });
}

function tituloNivel(b) {
  if (b.busca) return "Busca";
  if (b.nivel === "idiomas") return "Biblioteca";
  if (b.nivel === "decks") return nomeIdioma(b.idioma);
  return b.deckNome || "Cards";
}

function ctxCriar(b) {
  return { deckId: b.nivel === "cards" ? b.deckId : undefined, idioma: b.idioma || undefined };
}
