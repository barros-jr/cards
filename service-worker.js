/* =========================================================
   Service Worker do Fluência
   ---------------------------------------------------------
   O que ele faz na Etapa 1 (de propósito, simples):
   - Guarda o "esqueleto" do app (HTML/CSS/JS/ícones próprios)
     para o app abrir mesmo offline e instalar como PWA.
   - Estratégia "rede primeiro": quando ONLINE, sempre busca a
     versão mais nova na rede (evita o clássico "cache preso"
     mostrando código velho). Se estiver OFFLINE, usa o cache.
   - NÃO mexe em requisições de outros domínios (Supabase,
     esm.sh): essas vão direto para a rede.

   >>> Para publicar uma versão nova: incremente o número em
       CACHE_VERSION abaixo. Isso limpa o cache antigo. <<<
   ========================================================= */

const CACHE_VERSION = "v17";
const CACHE = `fluencia-${CACHE_VERSION}`;

// Arquivos do "esqueleto" que garantimos ter offline.
const ARQUIVOS_ESSENCIAIS = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/app.js",
  "/js/state.js",
  "/js/study.js",
  "/js/library.js",
  "/js/cards.js",
  "/js/audio.js",
  "/js/srs.js",
  "/js/config.js",
  "/js/supabase.js",
  "/manifest.json",
  "/icons/icon-180.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
];

// Instala: baixa o esqueleto e já assume o controle na próxima abertura.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARQUIVOS_ESSENCIAIS))
  );
  self.skipWaiting();
});

// Ativa: apaga caches de versões anteriores.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(
          chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Busca: rede primeiro para arquivos do próprio site; cai no cache se offline.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só cuidamos de GET do mesmo domínio. O resto (Supabase, CDN) vai direto.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((resposta) => {
        // Guarda uma cópia atualizada no cache.
        const copia = resposta.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copia));
        return resposta;
      })
      .catch(() =>
        // Offline: tenta o cache; se for navegação, cai no index.html.
        caches.match(req).then((r) => r || caches.match("/index.html"))
      )
  );
});
