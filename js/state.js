/* =========================================================
   state.js — estado central + render() + ajudante de DOM
   ---------------------------------------------------------
   Sem framework: a gente muda o estado com atualizar({...}) e
   a tela é redesenhada por uma função render() (registrada pelo
   app.js). O render é agendado com requestAnimationFrame para
   não redesenhar várias vezes seguidas (fica leve no celular).
   ========================================================= */

export const state = {
  rota: "home", // 'home' | 'estudo'
  carregando: true,
  idiomas: [], // idiomas disponíveis (ex.: ['es'])
  idiomasSelecionados: null, // array de códigos incluídos no estudo (null até carregar)
  detalheIdiomas: [], // [{ idioma, total, dominados, due }] — para a lista da Home
  modo: "revisao", // 'revisao' | 'pratica'
  pendentes: { due: 0, novos: 0, total: 0 }, // contagem do modo Revisão
  tetoRestante: null, // quantas entradas novas ainda cabem hoje (teto diário)
  totalIdioma: 0, // nº de cards do idioma (modo Prática livre)
  streak: 0, // foguinho (dias seguidos)
  estudouHoje: false, // já estudou hoje? (foguinho aceso)
  revisoesHoje: 0, // avaliações feitas hoje (barra de progresso do dia)
  mostrarFiltroIdiomas: false, // filtro de idiomas aberto no cartão Revisões?
  menuAberto: false, // gaveta lateral de navegação aberta?
  semana: [], // últimos 7 dias: [{ date, label, count }]
  stats: { total: 0, dominados: 0 }, // números da Home
  palavraDia: null, // card destacado do dia
  modoResposta: "ver", // 'ver' | 'digitar' | 'multipla'
  soDificeis: false, // estudar só os cards marcados como difíceis
  sessao: null, // { modo, modoResposta, fila, indice, revelado, previsao, opcoes, digitado, escolhida, acertou }
};

/* O app.js registra aqui a função que redesenha a tela. */
let _render = () => {};
export function registrarRender(fn) {
  _render = fn;
}

let _agendado = false;
export function atualizar(delta = {}) {
  Object.assign(state, delta);
  if (_agendado) return;
  _agendado = true;
  requestAnimationFrame(() => {
    _agendado = false;
    _render();
  });
}

/* Ícone de linha (Tabler). Uso: icone("flame"). */
export function icone(nome) {
  return el("i", { classe: `ti ti-${nome}`, "aria-hidden": "true" });
}

/* Cor de sinalização de um idioma (variável CSS; ver :root em styles.css).
   Cores moderadas por idioma (não bandeiras) ajudam a diferenciar sessões
   multi-idioma. Cai num tom neutro se o código não tiver cor definida. */
export function corIdioma(cod) {
  return `var(--lang-${cod}, var(--lang-outros))`;
}

/* Bandeira do idioma (emoji — zero peso, funciona em todo celular).
   Complementa a cor: a bandeira identifica num relance, a cor pinta
   barras e destaques. Inglês = 🇺🇸 (a voz do app é en-US). */
export function bandeiraIdioma(cod) {
  const bandeiras = { es: "🇪🇸", en: "🇺🇸", fr: "🇫🇷", it: "🇮🇹", de: "🇩🇪", pt: "🇧🇷" };
  return bandeiras[cod] || "🏳️";
}

/* Cria elementos via DOM (nunca "colando" texto cru com innerHTML).
   - classe: define className
   - texto: define textContent (seguro para dados do usuário)
   - onX: adiciona um event listener (ex.: onclick)
   - resto: vira atributo (aria-label, title, etc.) */
export function el(tag, attrs = {}, filhos = []) {
  const n = document.createElement(tag);
  for (const [chave, valor] of Object.entries(attrs)) {
    if (valor == null) continue;
    if (chave === "classe") n.className = valor;
    else if (chave === "texto") n.textContent = valor;
    else if (chave.startsWith("on") && typeof valor === "function") {
      n.addEventListener(chave.slice(2).toLowerCase(), valor);
    } else n.setAttribute(chave, valor);
  }
  for (const filho of [].concat(filhos)) {
    if (filho == null || filho === false) continue;
    n.append(typeof filho === "string" ? document.createTextNode(filho) : filho);
  }
  return n;
}
