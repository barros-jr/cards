/* =========================================================
   app.js — ponto de entrada do Fluência
   Liga tudo, registra o service worker, roteia entre as telas
   e desenha a Home (painel + controles de estudo multi-idioma).
   ========================================================= */

import { state, atualizar, registrarRender, el, icone, corIdioma, bandeiraIdioma } from "./state.js";
import {
  carregarContagens,
  carregarPainel,
  iniciarSessao,
  renderEstudo,
  nomeIdioma,
} from "./study.js";
import { construirBiblioteca, irParaBiblioteca } from "./library.js";
import { renderEditor } from "./cards.js";
import { tocarCard } from "./audio.js";

const VERSAO = "Fluência v1.3";

iniciar();

async function iniciar() {
  registrarRender(render);
  registrarServiceWorker();

  // Preferência trivial de interface: quais idiomas estão selecionados.
  try {
    const salvo = JSON.parse(localStorage.getItem("fluencia.idiomas") || "null");
    if (Array.isArray(salvo)) state.idiomasSelecionados = salvo;
  } catch {}

  render(); // primeira pintura ("Carregando…")
  await carregarContagens();
  atualizar({ carregando: false });
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
  const barra = el("header", { classe: "barra-topo barra-topo--home" }, [
    el("div", { classe: "marca" }, [logoMarca(), el("span", { classe: "barra-topo__titulo", texto: "Fluência" })]),
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

  const temIniciado = (state.detalheIdiomas || []).some((d) => d.iniciado);
  main.append(cartaoFoguinho());
  main.append(temIniciado ? cartaoRevisoes() : conviteBiblioteca());
  main.append(controlesEstudo());

  main.append(el("div", { classe: "secao-divisor" }));
  main.append(graficoSemana());
  main.append(cartaoNumeros());
  const palavra = cartaoPalavraDia();
  if (palavra) main.append(palavra);
  main.append(el("p", { classe: "versao texto-suave centro", texto: VERSAO }));

  raiz.replaceChildren(barra, main, barraNav("home"));
}

/* Cartão "Revisões": números do dia (revisões/novas), barra de progresso e,
   no canto superior direito, o botão que abre a seleção de idiomas. */
function cartaoRevisoes() {
  const due = state.pendentes.due;
  const novos = state.pendentes.novos;
  const feitas = state.revisoesHoje || 0;
  const total = feitas + due;
  const pct = total ? Math.round((feitas / total) * 100) : 100;

  const det = (state.detalheIdiomas || []).filter((d) => d.iniciado);
  const sel = state.idiomasSelecionados || [];
  const iniciadosCods = det.map((d) => d.idioma);
  const efetiva = new Set((sel.length ? sel : iniciadosCods).filter((c) => iniciadosCods.includes(c)));
  const filtrado = det.length > 1 && efetiva.size < det.length;

  const cab = el("div", { classe: "rev__cab" }, [
    el("span", { classe: "rev__icone" }, [icone("brain")]),
    el("h2", { classe: "rev__titulo", texto: "Revisões" }),
    det.length > 1
      ? el(
          "button",
          {
            classe: `rev__filtro ${state.mostrarFiltroIdiomas ? "rev__filtro--aberto" : ""}`,
            "aria-label": "Escolher idiomas da revisão",
            "aria-expanded": state.mostrarFiltroIdiomas ? "true" : "false",
            onclick: () => atualizar({ mostrarFiltroIdiomas: !state.mostrarFiltroIdiomas }),
          },
          [icone("adjustments-horizontal"), filtrado ? el("span", { classe: "rev__filtro-dot" }) : null]
        )
      : null,
  ]);

  const tiles = el("div", { classe: "rev__tiles" }, [
    el("div", { classe: "rev__tile" }, [
      el("span", { classe: "rev__tile-icone rev__tile-icone--rev" }, [icone("cards")]),
      el("div", {}, [
        el("div", { classe: "rev__tile-num", texto: String(due) }),
        el("div", { classe: "rev__tile-rot", texto: due === 1 ? "revisão" : "revisões" }),
      ]),
    ]),
    el("div", { classe: "rev__tile" }, [
      el("span", { classe: "rev__tile-icone rev__tile-icone--novas" }, [icone("book")]),
      el("div", {}, [
        el("div", { classe: "rev__tile-num", texto: String(novos) }),
        el("div", { classe: "rev__tile-rot", texto: novos === 1 ? "palavra nova" : "palavras novas" }),
      ]),
    ]),
  ]);

  const prog = el("div", { classe: "rev__prog" }, [
    el("div", { classe: "rev__prog-cab" }, [
      icone("history"),
      el("span", { texto: "Revisões de hoje" }),
      el("span", { classe: "rev__prog-pct", texto: `${pct}%` }),
    ]),
    el("div", { classe: "rev__barra" }, [el("div", { classe: "rev__barra-cheio", style: `width:${pct}%` })]),
    el("div", {
      classe: "rev__prog-sub texto-suave",
      texto: total
        ? `${feitas} ${feitas === 1 ? "feita" : "feitas"} de ${total} no total`
        : "Nenhuma revisão hoje — tudo em dia ✓",
    }),
  ]);

  const card = el("section", { classe: "cartao rev" }, [cab, tiles, prog]);
  if (state.mostrarFiltroIdiomas && det.length > 1) card.append(filtroIdiomas(det, efetiva));
  return card;
}

/* Área de seleção de idiomas (abre pelo botão do cartão Revisões). */
function filtroIdiomas(det, efetiva) {
  const wrap = el("div", { classe: "rev__filtro-area" });
  wrap.append(
    el("div", { classe: "rotulo-linha" }, [
      el("div", { classe: "rotulo", texto: "Idiomas da revisão" }),
      el("button", { classe: "link-sutil", onclick: selecionarTodos, texto: "Todos" }),
    ])
  );
  const filtro = el("div", { classe: "filtro-idiomas" });
  for (const d of det) filtro.append(chipIdioma(d, efetiva.has(d.idioma), true));
  wrap.append(filtro);

  // Aviso de interferência: espanhol + italiano são muito parecidos.
  if (efetiva.has("es") && efetiva.has("it")) {
    wrap.append(
      el("div", { classe: "dica-interferencia" }, [
        icone("bulb"),
        el("span", {
          texto:
            "Espanhol e italiano são parecidos — misturá-los na mesma sessão pode confundir. Se puder, estude cada um em um momento do dia.",
        }),
      ])
    );
  }

  const naoIniciados = (state.detalheIdiomas || []).filter((d) => !d.iniciado);
  if (naoIniciados.length) {
    const nomes = naoIniciados.map((d) => nomeIdioma(d.idioma));
    const listaNomes = nomes.length > 1 ? nomes.slice(0, -1).join(", ") + " e " + nomes[nomes.length - 1] : nomes[0];
    wrap.append(
      el("p", { classe: "dica-naoiniciados texto-suave centro", texto: `${listaNomes} ainda não ${nomes.length > 1 ? "começaram" : "começou"} — comece pela Biblioteca 📚` })
    );
  }
  return wrap;
}

/* Primeiro uso: nenhum idioma iniciado — a porta de entrada é a Biblioteca. */
function conviteBiblioteca() {
  return el("section", { classe: "cartao centro" }, [
    el("div", { classe: "conclusao__emoji" }, [icone("books")]),
    el("h2", { classe: "titulo-secao", texto: "Comece seu primeiro idioma" }),
    el("p", { classe: "texto-suave", texto: "Escolha um idioma na Biblioteca e aprenda suas primeiras palavras." }),
    el("button", { classe: "btn btn-primario btn-largo", onclick: irBiblioteca }, [icone("books"), " Ir para a Biblioteca"]),
  ]);
}

/* ---------------- Idiomas (linhas selecionáveis) ---------------- */

// Bandeira redonda com contador de revisões. Ativa = aro na cor do idioma;
// inativa = cinza/apagada. Badge verde com o nº de revisões, ou ✓ se em dia.
function chipIdioma(d, ativa, interativo) {
  const cor = corIdioma(d.idioma);
  const badge =
    d.due > 0
      ? el("span", { classe: "chip-idioma__badge", texto: d.due > 99 ? "99+" : String(d.due) })
      : el("span", { classe: "chip-idioma__badge chip-idioma__badge--ok", "aria-hidden": "true" }, [icone("check")]);
  const disco = el("span", { classe: "chip-idioma__disco", style: ativa ? `border-color:${cor}` : "" }, [
    el("span", { classe: "chip-idioma__bandeira", texto: bandeiraIdioma(d.idioma) }),
  ]);
  const rotulo = `${nomeIdioma(d.idioma)} — ${d.due > 0 ? `${d.due} ${d.due === 1 ? "revisão" : "revisões"}` : "em dia"}`;

  // Idioma único: nada a filtrar, vira só um indicador (não é botão).
  if (!interativo) {
    return el("span", { classe: "chip-idioma chip-idioma--ativo", title: rotulo, "aria-label": rotulo }, [disco, badge]);
  }
  return el(
    "button",
    {
      classe: `chip-idioma ${ativa ? "chip-idioma--ativo" : "chip-idioma--off"}`,
      onclick: () => toggleIdioma(d.idioma),
      "aria-pressed": ativa ? "true" : "false",
      "aria-label": rotulo,
      title: rotulo,
    },
    [disco, badge]
  );
}

function toggleIdioma(cod) {
  const base =
    state.idiomasSelecionados && state.idiomasSelecionados.length
      ? state.idiomasSelecionados.slice()
      : state.idiomas.slice();
  const sel = base.includes(cod) ? base.filter((c) => c !== cod) : [...base, cod];
  try { localStorage.setItem("fluencia.idiomas", JSON.stringify(sel)); } catch {}
  atualizar({ idiomasSelecionados: sel });
  carregarContagens();
  carregarPainel();
}

function selecionarTodos() {
  const sel = state.idiomas.slice();
  try { localStorage.setItem("fluencia.idiomas", JSON.stringify(sel)); } catch {}
  atualizar({ idiomasSelecionados: sel });
  carregarContagens();
  carregarPainel();
}

/* ---------------- Controles de estudo ---------------- */

function controlesEstudo() {
  const iniciados = (state.detalheIdiomas || []).filter((d) => d.iniciado);
  if (!iniciados.length) return el("div", {}); // sem idioma iniciado, a Home só convida à Biblioteca

  const wrap = el("div", {});
  wrap.append(el("div", { classe: "bloco" }, [chipDificeis()]));

  const botoes = el("div", { classe: "bloco-estudar" });
  if (state.pendentes.due > 0 || state.soDificeis) {
    botoes.append(el("button", { classe: "btn btn-primario btn-estudar", onclick: aoRevisar }, [icone("player-play"), " Revisar agora"]));
  }
  if (state.pendentes.novos > 0) {
    botoes.append(
      el("button", { classe: "btn btn-aprender", onclick: aoAprender }, [icone("book"), ` Aprender palavras novas (${state.pendentes.novos})`])
    );
  }
  wrap.append(botoes);
  return wrap;
}

function chipDificeis() {
  const ativo = state.soDificeis;
  return el("button", { classe: `chip chip-toggle ${ativo ? "chip--ativo" : ""}`, onclick: () => atualizar({ soDificeis: !state.soDificeis }) }, [icone("star"), "Só difíceis"]);
}

// Seleção efetiva restrita a idiomas já iniciados (a Home não estuda idioma virgem).
function selecaoIniciados() {
  const iniciados = (state.detalheIdiomas || []).filter((d) => d.iniciado).map((d) => d.idioma);
  const sel = state.idiomasSelecionados || [];
  const base = sel.length ? sel : iniciados;
  return base.filter((c) => iniciados.includes(c));
}

function aoRevisar() {
  const sel = selecaoIniciados();
  if (!sel.length) return; // seleção vazia: nada a revisar
  if (state.pendentes.due === 0 && !state.soDificeis) return;
  iniciarSessao(sel, "revisao", { modoResposta: "ver", soDificeis: state.soDificeis });
}

function aoAprender() {
  const sel = selecaoIniciados();
  if (!sel.length || state.pendentes.novos === 0) return;
  iniciarSessao(sel, "novas", {});
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

/* Marca no topo da Home: só as bolhas do logo (o fundo verde do ícone
   se funde com a barra). Conteúdo 100% do app — sem dados do usuário. */
function logoMarca() {
  const s = el("span", { classe: "marca__logo", "aria-hidden": "true" });
  s.innerHTML =
    '<svg viewBox="0 0 120 120" width="34" height="34">' +
    '<path d="M30 24 h36 a13 13 0 0 1 13 13 v16 a13 13 0 0 1 -13 13 h-22 l-14 13 3 -13 h-3 a13 13 0 0 1 -13 -13 v-16 a13 13 0 0 1 13 -13 z" fill="#f4efe6"/>' +
    '<text x="48" y="59" font-family="Fraunces, Georgia, serif" font-size="30" font-weight="600" fill="#1c5b46" text-anchor="middle">F</text>' +
    '<path d="M62 60 h32 a12 12 0 0 1 12 12 v12 a12 12 0 0 1 -12 12 h-3 l3 12 -13 -12 h-19 a12 12 0 0 1 -12 -12 v-12 a12 12 0 0 1 12 -12 z" fill="#c2703d"/>' +
    '<circle cx="70" cy="78" r="3.4" fill="#f4efe6"/><circle cx="79" cy="78" r="3.4" fill="#f4efe6"/><circle cx="88" cy="78" r="3.4" fill="#f4efe6"/>' +
    "</svg>";
  return s;
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
