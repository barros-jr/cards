# Fluência

App de **flashcards para aprender idiomas**, com repetição espaçada (algoritmo
FSRS-6 via `ts-fsrs`). Feito em **HTML + CSS + JavaScript puro** (ES Modules),
**mobile-first** e instalável como **PWA**. Backend em **Supabase**, hospedagem
na **Vercel**.

Este repositório está sendo construído em etapas. **Etapa 1 concluída:**
esqueleto do site + `manifest.json` + `service-worker.js` (instalável e
funcionando offline).

## Como rodar na sua máquina

Um app com ES Modules e service worker **não funciona abrindo o arquivo direto**
(`file://...`). Ele precisa ser servido por um servidor. Você já tem **Python 3**
instalado, então é só isto:

```bash
# dentro da pasta do projeto (onde está o index.html)
python3 -m http.server 8000
```

Depois abra no navegador: **http://localhost:8000**

> Dica: o service worker só funciona em `localhost` ou em `https`. No `localhost`
> funciona; na Vercel também (ela dá HTTPS de graça).

Se um dia instalar o Node, também pode usar `npx serve` — mas com Python não
precisa instalar nada.

### Fugindo do "cache preso" durante o desenvolvimento

O service worker guarda arquivos para funcionar offline. Em desenvolvimento isso
às vezes faz você ver a **versão antiga** do app. Para evitar:

1. Abra o **DevTools** do navegador (F12) → aba **Application** → **Service
   Workers** → marque **"Update on reload"**.
2. Recarregue com **Cmd+Shift+R** (recarga forçada).
3. Ao publicar uma versão nova, incremente o `CACHE_VERSION` em
   `service-worker.js`.

## Como publicar na Vercel (site estático, sem build)

1. Suba este repositório para o **GitHub**.
2. Na Vercel, **Add New → Project** e importe o repositório.
3. Em **Framework Preset**, escolha **Other**. Deixe **Build Command** e
   **Output Directory** vazios (é site estático, não tem build).
4. **Deploy**. A cada `git push`, a Vercel publica sozinha.

O arquivo `vercel.json` já cuida de dois detalhes: o `service-worker.js` não fica
preso em cache e o `manifest.json` é servido com o tipo correto.

## Estrutura das pastas

```
/
  index.html            página única (o "esqueleto" visual)
  manifest.json         nome, ícones e cor do PWA (instalável)
  service-worker.js     cache do esqueleto (offline) + atualização
  vercel.json           cabeçalhos para a hospedagem estática
  css/
    styles.css          estilos base (mobile-first)
  js/
    config.js           URL + chave anon do Supabase        (Etapa 2)
    supabase.js         cria o cliente do Supabase           (Etapa 2)
    srs.js              embrulha a ts-fsrs (FSRS-6)           (Etapa 3)
    audio.js            TTS + tocar áudio                    (Etapa 4)
    state.js            estado central + render()            (Etapa 4)
    study.js            sessão de estudo + fila de cards     (Etapa 4)
    library.js          biblioteca (idioma → deck → card)    (Etapa 5)
    cards.js            criar/editar card                    (Etapa 5)
    app.js              ponto de entrada + registra o SW     (Etapa 1)
  icons/
    icon-192.png
    icon-512.png
    icon-512-maskable.png
```

Os arquivos marcados com etapa futura já existem como "esqueleto" (vazios), só
para a estrutura ficar visível. Eles serão preenchidos na etapa indicada.
