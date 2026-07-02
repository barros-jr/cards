/* =========================================================
   srs.js — ÚNICO arquivo que fala com o algoritmo de repetição
   espaçada (ts-fsrs / FSRS-6). O resto do app usa só as funções
   exportadas aqui e NÃO conhece a biblioteca. Para trocar de
   algoritmo no futuro, basta mexer neste arquivo.

   Ideia central:
   - O "progresso" que o app e o Supabase usam é um objeto SIMPLES
     (as colunas da tabela card_progress): datas como texto ISO,
     state como número (0..3). Aqui a gente converte de/para o
     objeto "Card" da ts-fsrs (que usa Date) quando necessário.
   ========================================================= */

import {
  fsrs,
  createEmptyCard,
  Rating,
  FSRSVersion,
} from "https://esm.sh/ts-fsrs@5.4.1";

// Uma única instância do agendador, com os parâmetros padrão (FSRS-6).
const agendador = fsrs();

// Versão do algoritmo (útil para depurar/confirmar que é FSRS-6).
export const versaoAlgoritmo = FSRSVersion;

/* Notas amigáveis (em português) -> valores de Rating da ts-fsrs.
   São os 4 botões da tela de estudo. */
export const NOTAS = Object.freeze({
  ERREI: Rating.Again, // 1
  DIFICIL: Rating.Hard, // 2
  BOM: Rating.Good, // 3
  FACIL: Rating.Easy, // 4
});

// Rótulos para os botões (a tela usa isto).
export const ROTULOS_NOTA = Object.freeze({
  ERREI: "Errei",
  DIFICIL: "Difícil",
  BOM: "Bom",
  FACIL: "Fácil",
});

/* -------- Conversão Card (ts-fsrs) <-> progresso (colunas do banco) -------- */

function paraISO(valor) {
  if (valor == null) return null; // só null/undefined viram null (preserva 0/"")
  return valor instanceof Date ? valor.toISOString() : valor;
}

// Card da ts-fsrs (com Date) -> objeto simples com as colunas de card_progress.
// Obs.: elapsed_days e scheduled_days PODEM ser fracionários (passos em
// minutos), por isso as colunas no banco são double precision — não arredonde.
function paraProgresso(card) {
  return {
    due: paraISO(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state, // inteiro 0..3 (New/Learning/Review/Relearning)
    last_review: paraISO(card.last_review),
  };
}

/* -------- API pública usada pelo app -------- */

// Estado inicial de um card que nunca foi estudado.
// (due = agora, ou seja, um card novo já "entra" como pendente.)
export function progressoNovo(agora = new Date()) {
  return paraProgresso(createEmptyCard(agora));
}

// Aplica uma avaliação (nota) e devolve o NOVO progresso, pronto para gravar.
export function avaliar(progresso, nota, agora = new Date()) {
  const resultado = agendador.next(progresso, agora, nota);
  return paraProgresso(resultado.card);
}

// Já venceu? (due <= agora) — usado para montar a fila de revisão.
// Comparação em epoch (UTC), robusta a fuso. Se due estiver ausente/inválido,
// retorna false (não entra na fila) em vez de comportamento imprevisível.
export function estaVencido(progresso, agora = new Date()) {
  const due = progresso == null ? null : progresso.due;
  const t = due == null ? NaN : new Date(due).getTime();
  if (!Number.isFinite(t)) return false;
  return t <= new Date(agora).getTime();
}

/* Pré-visualização: para cada uma das 4 notas, qual seria a próxima data
   e um texto de intervalo (ex.: "10 min", "3 dias"). A tela de estudo usa
   isto para mostrar o intervalo debaixo de cada botão. Não altera o
   progresso salvo (repeat só calcula uma prévia). */
export function previsao(progresso, agora = new Date()) {
  const previa = agendador.repeat(progresso, agora);
  const saida = {};
  for (const [chave, nota] of Object.entries(NOTAS)) {
    const proximoCard = previa[nota].card;
    saida[chave] = {
      due: paraISO(proximoCard.due),
      intervaloTexto: intervaloHumano(agora, proximoCard.due),
    };
  }
  return saida;
}

// Transforma a diferença entre duas datas num texto curto em português.
// Calcula cada unidade direto da diferença em ms (sem arredondar em cascata).
export function intervaloHumano(de, ate) {
  const ms = new Date(ate).getTime() - new Date(de).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "agora";

  const min = ms / 60000;
  const horas = ms / 3600000;
  const dias = ms / 86400000;

  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  if (horas < 24) return `${Math.round(horas)} h`;
  if (dias < 30.4) {
    const d = Math.round(dias);
    return `${d} ${d === 1 ? "dia" : "dias"}`;
  }
  if (dias < 365) {
    const m = Math.round(dias / 30.44);
    return `${m} ${m === 1 ? "mês" : "meses"}`;
  }
  const anos = dias / 365.25;
  const texto = anos < 10 ? anos.toFixed(1) : String(Math.round(anos));
  return `${texto} ${texto === "1.0" ? "ano" : "anos"}`;
}
