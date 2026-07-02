/* =========================================================
   cards.js — criar / editar card
   Frente/verso (básico) ou texto com lacuna (cloze), escolher
   baralho (ou criar um novo), e testar a pronúncia (TTS).
   (Anexar áudio gravado ficou para uma fase futura.)
   ========================================================= */

import { supabase } from "./supabase.js";
import { USUARIO_ID } from "./config.js";
import { state, atualizar, el, icone } from "./state.js";
import { falar } from "./audio.js";
import { nomeIdioma } from "./study.js";
import { recarregarBiblioteca } from "./library.js";

// Idiomas oferecidos ao criar um baralho (código -> nome + voz TTS padrão).
export const IDIOMAS = [
  { cod: "es", nome: "Espanhol", tts: "es-ES" },
  { cod: "en", nome: "Inglês", tts: "en-US" },
  { cod: "fr", nome: "Francês", tts: "fr-FR" },
  { cod: "it", nome: "Italiano", tts: "it-IT" },
  { cod: "de", nome: "Alemão", tts: "de-DE" },
  { cod: "pt", nome: "Português", tts: "pt-BR" },
];
function ttsDe(cod) {
  return (IDIOMAS.find((i) => i.cod === cod) || {}).tts || cod;
}

/* Abre o editor. card = objeto existente (editar) ou null (novo).
   ctx = { deckId, idioma } para pré-selecionar quando vem de um deck. */
export async function abrirEditor(card = null, ctx = {}) {
  const { data: decks } = await supabase.from("decks").select("*").order("name");
  const lista = decks || [];
  const semDecks = lista.length === 0;
  atualizar({
    rota: "editor",
    editor: {
      cardId: card?.id || null,
      tipo: card?.type || "basic",
      deckId: card?.deck_id || ctx.deckId || (lista[0] && lista[0].id) || null,
      front: card?.front || "",
      back: card?.back || "",
      example: card?.example || "",
      cloze_text: card?.cloze_text || "",
      novoDeck: semDecks && !ctx.deckId,
      novoDeckNome: "",
      novoDeckIdioma: ctx.idioma || "es",
      decks: lista,
      salvando: false,
      erro: null,
    },
  });
}

/* Lê os valores digitados de volta para o state antes de um re-render
   (assim o que foi digitado não se perde ao trocar tipo/baralho). */
function capturar() {
  const e = state.editor;
  if (!e) return;
  const v = (sel) => document.querySelector(sel);
  if (v("#ed-front")) e.front = v("#ed-front").value;
  if (v("#ed-back")) e.back = v("#ed-back").value;
  if (v("#ed-exemplo")) e.example = v("#ed-exemplo").value;
  if (v("#ed-cloze")) e.cloze_text = v("#ed-cloze").value;
  if (v("#ed-novodeck-nome")) e.novoDeckNome = v("#ed-novodeck-nome").value;
}

function setTipo(tipo) {
  capturar();
  state.editor.tipo = tipo;
  state.editor.erro = null;
  atualizar();
}

function onDeckChange(valor) {
  capturar();
  if (valor === "__novo__") state.editor.novoDeck = true;
  else {
    state.editor.novoDeck = false;
    state.editor.deckId = valor;
  }
  atualizar();
}

function onIdiomaNovo(valor) {
  capturar();
  state.editor.novoDeckIdioma = valor;
  atualizar();
}

function idiomaAtual(e) {
  if (e.novoDeck) return e.novoDeckIdioma;
  const d = e.decks.find((x) => x.id === e.deckId);
  return d ? d.language : "es";
}

function testarPronuncia() {
  capturar();
  const e = state.editor;
  const texto = e.tipo === "cloze" ? (e.cloze_text || "").replace(/[\[\]]/g, "") : e.front || "";
  falar(texto, ttsDe(idiomaAtual(e)));
}

async function salvar() {
  capturar();
  const e = state.editor;

  if (e.tipo === "basic" && !e.front.trim()) return erro("Preencha a frente do card.");
  if (e.tipo === "cloze" && !e.cloze_text.trim()) return erro("Preencha o texto com a lacuna.");

  let deckId = e.deckId;
  let idiomaCod;

  if (e.novoDeck) {
    if (!e.novoDeckNome.trim()) return erro("Dê um nome ao novo baralho.");
    const { data: novo, error } = await supabase
      .from("decks")
      .insert({ owner_id: USUARIO_ID, language: e.novoDeckIdioma, name: e.novoDeckNome.trim() })
      .select()
      .single();
    if (error) {
      console.warn(error);
      return erro("Não consegui criar o baralho.");
    }
    deckId = novo.id;
    idiomaCod = novo.language;
  } else {
    const d = e.decks.find((x) => x.id === deckId);
    if (!d) return erro("Escolha um baralho.");
    idiomaCod = d.language;
  }

  const registro = {
    deck_id: deckId,
    language: idiomaCod,
    type: e.tipo,
    front: e.tipo === "basic" ? e.front.trim() : null,
    back: e.back.trim() || null,
    example: e.tipo === "basic" ? e.example.trim() || null : null,
    cloze_text: e.tipo === "cloze" ? e.cloze_text.trim() : null,
    tts_lang: ttsDe(idiomaCod),
  };

  e.salvando = true;
  atualizar();

  const resposta = e.cardId
    ? await supabase.from("cards").update(registro).eq("id", e.cardId)
    : await supabase.from("cards").insert(registro);

  if (resposta.error) {
    console.warn(resposta.error);
    e.salvando = false;
    return erro("Não consegui salvar o card.");
  }
  await recarregarBiblioteca();
}

async function excluir() {
  const e = state.editor;
  if (!e.cardId) return;
  if (!confirm("Excluir este card? Isso não pode ser desfeito.")) return;
  const { error } = await supabase.from("cards").delete().eq("id", e.cardId);
  if (error) {
    console.warn(error);
    return erro("Não consegui excluir.");
  }
  await recarregarBiblioteca();
}

function cancelar() {
  atualizar({ rota: "biblioteca", editor: null });
}

function erro(msg) {
  state.editor.erro = msg;
  atualizar();
}

/* ---------------- Tela ---------------- */

export function renderEditor(raiz) {
  const e = state.editor;

  const barra = el("header", { classe: "barra-topo barra-topo--sessao" }, [
    el("button", { classe: "btn-voltar", "aria-label": "Cancelar", onclick: cancelar }, [icone("arrow-left")]),
    el("span", { classe: "barra-topo__titulo", texto: e.cardId ? "Editar card" : "Novo card" }),
    el("span", { classe: "btn-voltar-placeholder" }),
  ]);

  const main = el("main", { classe: "conteudo" });

  // Tipo
  main.append(
    el("div", { classe: "segmentos" }, [segTipo("Básico", "basic"), segTipo("Cloze", "cloze")])
  );

  // Baralho
  const selDeck = el("select", { classe: "campo", onchange: (ev) => onDeckChange(ev.target.value) });
  for (const d of e.decks) {
    const o = el("option", { value: d.id, texto: `${nomeIdioma(d.language)} · ${d.name}` });
    if (!e.novoDeck && d.id === e.deckId) o.selected = true;
    selDeck.append(o);
  }
  const oNovo = el("option", { value: "__novo__", texto: "+ Novo baralho…" });
  if (e.novoDeck) oNovo.selected = true;
  selDeck.append(oNovo);
  main.append(grupo("Baralho", selDeck));

  if (e.novoDeck) {
    const selIdi = el("select", { classe: "campo", onchange: (ev) => onIdiomaNovo(ev.target.value) });
    for (const i of IDIOMAS) {
      const o = el("option", { value: i.cod, texto: i.nome });
      if (i.cod === e.novoDeckIdioma) o.selected = true;
      selIdi.append(o);
    }
    main.append(grupo("Idioma do novo baralho", selIdi));
    main.append(
      grupo(
        "Nome do novo baralho",
        el("input", { classe: "campo", id: "ed-novodeck-nome", value: e.novoDeckNome, placeholder: "Ex.: Verbos comuns" })
      )
    );
  }

  // Campos por tipo
  if (e.tipo === "basic") {
    main.append(grupo("Frente (o que se aprende)", el("input", { classe: "campo", id: "ed-front", value: e.front, placeholder: "Ex.: hola" })));
    main.append(grupo("Verso (tradução / resposta)", el("input", { classe: "campo", id: "ed-back", value: e.back, placeholder: "Ex.: olá" })));
    main.append(grupo("Frase de exemplo (opcional, recomendado)", el("input", { classe: "campo", id: "ed-exemplo", value: e.example, placeholder: "Ex.: ¡Hola! ¿Cómo estás?" })));
    main.append(el("p", { classe: "dica", texto: "Uma frase curta usando a palavra ajuda muito a memorizar." }));
  } else {
    const ta = el("textarea", { classe: "campo", id: "ed-cloze", placeholder: "Ex.: El gato bebe [leche]" });
    ta.value = e.cloze_text;
    main.append(grupo("Texto com lacuna", ta));
    main.append(el("p", { classe: "dica", texto: "Ponha a palavra escondida entre colchetes. Ex.: El gato bebe [leche]" }));
    main.append(grupo("Tradução (opcional)", el("input", { classe: "campo", id: "ed-back", value: e.back, placeholder: "Ex.: O gato bebe leite" })));
  }

  // Testar pronúncia
  main.append(el("button", { classe: "btn btn-largo", onclick: testarPronuncia }, [icone("volume"), " Testar pronúncia"]));

  if (e.erro) main.append(el("p", { classe: "erro", texto: e.erro }));

  // Ações
  const acoes = el("div", { classe: "form-acoes" }, [
    el("button", { classe: "btn btn-primario", onclick: salvar, texto: e.salvando ? "Salvando…" : "Salvar" }),
  ]);
  const linha2 = el("div", { classe: "linha-botoes" }, [
    el("button", { classe: "btn", onclick: cancelar, texto: "Cancelar" }),
  ]);
  if (e.cardId) linha2.append(el("button", { classe: "btn", onclick: excluir, texto: "Excluir" }));
  acoes.append(linha2);
  main.append(acoes);

  raiz.replaceChildren(barra, main);
}

function grupo(rotulo, campo) {
  return el("div", { classe: "form-grupo" }, [el("label", { classe: "form-rotulo", texto: rotulo }), campo]);
}

function segTipo(rotulo, valor) {
  const ativo = state.editor.tipo === valor;
  return el("button", { classe: `segmento ${ativo ? "segmento--ativo" : ""}`, onclick: () => setTipo(valor), texto: rotulo });
}
