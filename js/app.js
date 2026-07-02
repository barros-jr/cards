/* =========================================================
   app.js — ponto de entrada do Fluência
   ========================================================= */

import { state, atualizar, registrarRender, el, icone } from "./state.js";
import {
  carregarIdiomas,
  carregarContagens,
  carregarPainel,
  iniciarSessao,
  renderEstudo,
  nomeIdioma,
} from "./study.js";
import { construirBiblioteca, irParaBiblioteca } from "./library.js";
import { renderEditor } from "./cards.js";
import { tocarCard } from "./audio.js";

const VERSAO = "Fluência v1.0";

iniciar();

async function iniciar() {
  registrarRender(render);
  registrarServiceWorker();
  render();

  const idiomas = await carregarIdiomas();
  atualizar({ idiomas, carregando: false });
  await carregarContagens();
  await carregarPainel();
}

function render() {
  const raiz = document.getElementById("app");
  if (!raiz) return;

  if (state.rota === "estudo" && state.sessao) return renderEstudo(raiz);
  if (state.rota === "editor" && state.editor) return renderEditor(raiz);

  if (state.rota === "biblioteca") {
    raiz.replaceChildren(...construirBiblioteca(), barraNav("biblioteca"));
    const busca = document.getElementById("bib-busca");
    if (state.bib && state.bib.busca && busca) {
      busca.focus();
      const v = busca.value;
      try { busca.setSelectionRange(v.length, v.length); } catch {}
    }
    return;
  }

  renderHome(raiz);
}

/* ---------------- Home ---------------- */

function renderHome(raiz) {
  const barra = el("header", { classe: "barra-topo" }, [
    el("span", { classe: "barra-topo__titulo", texto: "Fluência" }),
    el("span", { classe: `foguinho ${state.estudouHoje ? "" : "foguinho--apagado"}`, title: "Dias seguidos" }, [
      icone("flame"),
      el("span", { texto: String(state.streak) }),
    ]),
  ]);

  const main = el("main", { classe: "conteudo" });

  if (state.carregando) {
    main.append(el("p", { classe: "texto-suave centro", texto: "Carregando…" }));
    raiz.replaceChildren(barra, main, barraNav("home"));
    return;
  }

  main.append(cartaoFoguinho());
  main.append(cartaoContagem());
  main.append(controlesEstudo());

  main.append(el("div", { classe: "secao-divisor" }));
  main.append(graficoSemana());
  main.append(cartaoNumeros());
  const palavra = cartaoPalavraDia();
  if (palavra) main.append(palavra);
  main.append(el("p", { classe: "versao texto-suave centro", texto: VERSAO }));

  raiz.replaceChildren(barra, main, barraNav("home"));
}

function cartaoContagem() {
  const revisao = state.modo === "revisao";
  const numero = revisao ? state.pendentes.total : state.totalIdioma;
  return el("section", { classe: "cartao contagem" }, [
    el("div", { classe: "contagem__num", texto: String(numero) }),
    el("div", { classe: "contagem__rot texto-suave", texto: `${numero === 1 ? "card" : "cards"} para ${revisao ? "revisar hoje" : "praticar"}` }),
    revisao && (state.pendentes.due || state.pendentes.novos)
      ? el("div", { classe: "contagem__detalhe texto-suave", texto: `${state.pendentes.due} para revisar · ${state.pendentes.novos} novos` })
      : null,
  ]);
}

function controlesEstudo() {
  const revisao = state.modo === "revisao";
  const numero = revisao ? state.pendentes.total : state.totalIdioma;
  const semNada = numero === 0 && !state.soDificeis;

  const chips = el("div", { classe: "chips" }, [chip("Todos", "todos")]);
  for (const idi of state.idiomas) chips.append(chip(nomeIdioma(idi), idi));

  const wrap = el("div", {});
  wrap.append(el("div", { classe: "bloco" }, [el("div", { classe: "rotulo", texto: "Idioma" }), chips]));
  wrap.append(el("div", { classe: "segmentos" }, [segmento("Revisão", "revisao"), segmento("Prática livre", "pratica")]));
  wrap.append(
    el("div", { classe: "bloco" }, [
      el("div", { classe: "rotulo", texto: "Como responder?" }),
      el("div", { classe: "segmentos" }, [segResp("Ver", "ver"), segResp("Digitar", "digitar"), segResp("Múltipla", "multipla"), segResp("Ouvir", "ouvir")]),
    ])
  );
  wrap.append(el("div", { classe: "bloco" }, [chipDificeis()]));
  wrap.append(
    el("div", { classe: "bloco-estudar" }, [
      el("button", { classe: "btn btn-primario btn-estudar", onclick: aoEstudar }, [icone("player-play"), " Estudar"]),
      el("button", { classe: "btn btn-surpresa", onclick: aoSurpresa }, [icone("dice-5"), " Surpresa"]),
      semNada && revisao ? el("p", { classe: "texto-suave centro", texto: "Tudo em dia por aqui." }) : null,
      semNada && !revisao ? el("p", { classe: "texto-suave centro", texto: "Nenhum card neste idioma ainda." }) : null,
    ])
  );
  return wrap;
}

function chip(rotulo, valor) {
  const ativo = state.idioma === valor;
  return el("button", { classe: `chip ${ativo ? "chip--ativo" : ""}`, onclick: () => trocarIdioma(valor), texto: rotulo });
}

function segmento(rotulo, valor) {
  const ativo = state.modo === valor;
  return el("button", { classe: `segmento ${ativo ? "segmento--ativo" : ""}`, onclick: () => trocarModo(valor), texto: rotulo });
}

function segResp(rotulo, valor) {
  const ativo = state.modoResposta === valor;
  return el("button", { classe: `segmento ${ativo ? "segmento--ativo" : ""}`, onclick: () => { if (state.modoResposta !== valor) atualizar({ modoResposta: valor }); }, texto: rotulo });
}

function chipDificeis() {
  const ativo = state.soDificeis;
  return el("button", { classe: `chip chip-toggle ${ativo ? "chip--ativo" : ""}`, onclick: () => atualizar({ soDificeis: !state.soDificeis }) }, [icone("star"), "Só difíceis"]);
}

async function trocarIdioma(valor) {
  if (state.idioma === valor) return;
  atualizar({ idioma: valor });
  await carregarContagens();
}

function trocarModo(valor) {
  if (state.modo === valor) return;
  atualizar({ modo: valor });
}

function aoEstudar() {
  const numero = state.modo === "revisao" ? state.pendentes.total : state.totalIdioma;
  if (numero === 0 && !state.soDificeis) return;
  iniciarSessao(state.idioma, state.modo, { modoResposta: state.modoResposta, soDificeis: state.soDificeis });
}

function aoSurpresa() {
  iniciarSessao("todos", "pratica", { modoResposta: "multipla", soDificeis: false });
}

/* ---------------- Painel ---------------- */

function cartaoFoguinho() {
  const proximo = [7, 30, 100, 365, 1000].find((m) => m > state.streak);
  const filhos = [
    el("div", { classe: "foguinho-card__num", texto: `${state.streak} ${state.streak === 1 ? "dia" : "dias"} seguidos` }),
    el("div", { classe: "foguinho-card__msg texto-suave", texto: mensagemFoguinho() }),
  ];
  if (proximo) filhos.push(el("div", { classe: "foguinho-card__meta" }, [`faltam ${proximo - state.streak} para `, icone("flame"), ` ${proximo}`]));
  return el("section", { classe: `cartao foguinho-card ${state.estudouHoje ? "aceso" : ""}` }, [
    el("div", { classe: "foguinho-card__icone" }, [icone("flame")]),
    el("div", {}, filhos),
  ]);
}

function mensagemFoguinho() {
  if (state.estudouHoje && state.pendentes.total === 0) return "Dia concluído!";
  if (state.estudouHoje) return "Você estudou hoje";
  if (state.streak > 0) return "Estude hoje para manter a sequência";
  return "Comece sua sequência hoje";
}

function graficoSemana() {
  const dados = state.semana || [];
  const total = dados.reduce((a, b) => a + b.count, 0);
  const max = Math.max(1, ...dados.map((d) => d.count));
  const W = 320, H = 132, pad = 14, base = H - 22, topo = 14, larg = 24;
  const passo = (W - pad * 2) / (dados.length || 7);
  let barras = "";
  dados.forEach((d, i) => {
    const x = pad + i * passo + (passo - larg) / 2;
    const h = d.count > 0 ? Math.max(4, (d.count / max) * (base - topo)) : 2;
    const y = base - h;
    const cx = (x + larg / 2).toFixed(1);
    barras += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${larg}" height="${h.toFixed(1)}" rx="5" fill="${d.count > 0 ? "var(--acento)" : "var(--cor-borda)"}"></rect>`;
    if (d.count > 0) barras += `<text x="${cx}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--cor-texto-suave)">${d.count}</text>`;
    barras += `<text x="${cx}" y="${H - 5}" text-anchor="middle" font-size="11" fill="var(--cor-texto-suave)">${d.label}</text>`;
  });

  const card = el("section", { classe: "cartao" }, [
    secaoTitulo("chart-line", "Sua semana"),
    el("div", { classe: "texto-suave", texto: `${total} ${total === 1 ? "revisão" : "revisões"} nos últimos 7 dias` }),
  ]);
  const box = el("div", { classe: "grafico" });
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Revisões dos últimos 7 dias">${barras}</svg>`;
  card.append(box);
  return card;
}

function cartaoNumeros() {
  const { total, dominados } = state.stats;
  const pct = total ? Math.round((dominados / total) * 100) : 0;
  const grid = el("div", { classe: "metricas" }, [
    metrica(String(total), "cards no total"),
    metrica(String(dominados), "dominados"),
    metrica(`${pct}%`, "do total"),
  ]);
  return el("section", { classe: "cartao" }, [secaoTitulo("chart-bar", "Seu progresso"), grid]);
}

function metrica(num, rot) {
  return el("div", { classe: "metrica" }, [
    el("div", { classe: "metrica__num", texto: num }),
    el("div", { classe: "metrica__rot texto-suave", texto: rot }),
  ]);
}

function cartaoPalavraDia() {
  const c = state.palavraDia;
  if (!c) return null;
  const texto = c.type === "cloze" ? (c.cloze_text || "").replace(/[\[\]]/g, "") : c.front || "";
  const card = el("section", { classe: "cartao" }, [secaoTitulo("sparkles", "Palavra do dia")]);
  card.append(
    el("div", { classe: "palavra-dia__linha" }, [
      el("div", {}, [
        el("div", { classe: "palavra-dia__texto", texto: texto }),
        c.back ? el("div", { classe: "palavra-dia__trad texto-suave", texto: c.back }) : null,
      ]),
      el("button", { classe: "btn-audio", "aria-label": "Ouvir", onclick: () => tocarCard(c) }, [icone("volume")]),
    ])
  );
  return card;
}

function secaoTitulo(nome, texto) {
  return el("div", { classe: "secao-titulo" }, [
    el("span", { classe: "secao-icone" }, [icone(nome)]),
    el("span", { texto }),
  ]);
}

/* ---------------- Barrinha inferior ---------------- */

function barraNav(ativa) {
  return el("nav", { classe: "tabbar" }, [
    tab("home", "Hoje", "home", ativa, irHome),
    tab("books", "Biblioteca", "biblioteca", ativa, irBiblioteca),
  ]);
}

function tab(nome, rotulo, rota, ativa, onclick) {
  return el("button", { classe: `tab ${ativa === rota ? "tab--ativa" : ""}`, onclick }, [
    el("span", { classe: "tab__icone" }, [icone(nome)]),
    el("span", { classe: "tab__rotulo", texto: rotulo }),
  ]);
}

function irHome() {
  atualizar({ rota: "home" });
  carregarContagens();
  carregarPainel();
}

function irBiblioteca() {
  irParaBiblioteca();
}

/* ---------------- Service worker ---------------- */

async function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/service-worker.js");
  } catch (erro) {
    console.warn("Falha ao registrar o service worker:", erro);
  }
}
