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
  idioma: "todos", // filtro atual ('todos' ou um idioma)
  modo: "revisao", // 'revisao' | 'pratica'
  pendentes: { due: 0, novos: 0, total: 0 }, // contagem do modo Revisão
  totalIdioma: 0, // nº de cards do idioma (modo Prática livre)
  streak: 0, // foguinho (dias seguidos)
  estudouHoje: false, // já estudou hoje? (foguinho aceso)
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
