/* =========================================================
   audio.js — som dos cards
   ---------------------------------------------------------
   Regra: por padrão usa TTS (voz sintetizada do próprio celular),
   escolhendo a voz pelo tts_lang do card. Se o card tiver
   audio_url, toca o arquivo gravado em vez do TTS.

   Cuidados do iPhone (Safari):
   - As vozes carregam de forma atrasada: getVoices() pode vir
     vazio no começo. Por isso a gente escuta 'voiceschanged' e
     também tenta recarregar na hora de falar.
   - falar() precisa ser chamado a partir de um toque do usuário
     (o botão 🔊 já é um toque, então tudo certo).
   ========================================================= */

let _vozes = [];

function carregarVozes() {
  if (typeof speechSynthesis === "undefined") return;
  const lista = speechSynthesis.getVoices();
  if (lista && lista.length) _vozes = lista;
}

// tenta carregar já e também quando o navegador avisar que mudou
if (typeof speechSynthesis !== "undefined") {
  carregarVozes();
  speechSynthesis.addEventListener?.("voiceschanged", carregarVozes);
}

// Escolhe a melhor voz para um idioma (ex.: 'es-ES' -> voz espanhola).
function melhorVoz(lang) {
  if (!_vozes.length) carregarVozes();
  if (!lang || !_vozes.length) return null;
  const alvo = lang.toLowerCase();
  const prefixo = alvo.split("-")[0];
  return (
    _vozes.find((v) => v.lang.toLowerCase() === alvo) ||
    _vozes.find((v) => v.lang.toLowerCase().replace("_", "-") === alvo) ||
    _vozes.find((v) => v.lang.toLowerCase().startsWith(prefixo)) ||
    null
  );
}

/* Fala um texto usando a voz do idioma pedido. */
export function falar(texto, lang) {
  if (typeof speechSynthesis === "undefined" || !texto) return;
  try {
    speechSynthesis.cancel(); // interrompe algo que esteja tocando
    const fala = new SpeechSynthesisUtterance(texto);
    if (lang) fala.lang = lang;
    const voz = melhorVoz(lang);
    if (voz) fala.voice = voz;
    fala.rate = 0.95; // um tiquinho mais devagar ajuda a aprender
    speechSynthesis.speak(fala);
  } catch (erro) {
    console.warn("TTS falhou:", erro);
  }
}

let _audioAtual = null;

/* Toca um arquivo de áudio gravado (audio_url). */
export function tocarUrl(url) {
  try {
    if (_audioAtual) _audioAtual.pause();
    _audioAtual = new Audio(url);
    _audioAtual.play().catch((e) => console.warn("Áudio falhou:", e));
  } catch (erro) {
    console.warn("Áudio falhou:", erro);
  }
}

/* Decide o que falar de um card:
   - básico: fala a frente (a palavra no idioma que se aprende);
   - cloze: fala a frase completa (sem os colchetes). */
function textoParaFalar(card) {
  if (card.type === "cloze" && card.cloze_text) {
    return card.cloze_text.replace(/[\[\]]/g, "");
  }
  return card.front || "";
}

/* Ponto único usado pela tela de estudo: toca o áudio do card.
   Se tiver arquivo gravado, usa ele; senão, usa o TTS. */
export function tocarCard(card) {
  if (!card) return;
  if (card.audio_url) {
    tocarUrl(card.audio_url);
    return;
  }
  falar(textoParaFalar(card), card.tts_lang || card.language);
}
