-- =========================================================
-- Fluência — Etapa 2: esquema do banco + seed
-- Aplicado no projeto Supabase "Cards" (ref sbkcnqkwddklrpdxmnxu)
-- em 2026-07-02. Guardado aqui só como registro/reprodução.
--
-- Este arquivo é a "fonte da verdade" do banco. Se um dia precisar
-- recriar tudo, dá para colar isto no SQL Editor do Supabase.
-- =========================================================

-- ---------- Tabelas ----------

-- Perfil de cada usuário (Fase 1: um perfil fixo, sem login)
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  created_at timestamptz not null default now()
);

-- Baralhos/temas
create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  language text not null,
  name text not null,
  created_at timestamptz not null default now()
);

-- Conteúdo dos cards (compartilhável entre usuários)
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid references public.decks(id) on delete cascade,
  language text not null,
  type text not null default 'basic' check (type in ('basic','cloze')),
  front text,
  back text,
  cloze_text text,
  audio_url text,
  tts_lang text,
  example text,            -- frase de exemplo (contexto i+1), mostrada no verso
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Estado do FSRS POR usuário (agendamento independente por pessoa)
create table if not exists public.card_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  due timestamptz,
  stability double precision,
  difficulty double precision,
  elapsed_days double precision,   -- pode ser fracionário (passos em minutos)
  scheduled_days double precision, -- idem
  learning_steps integer,
  reps integer,
  lapses integer,
  state smallint,          -- 0=New, 1=Learning, 2=Review, 3=Relearning
  dificil boolean not null default false, -- marcado como difícil pelo usuário
  direcao text not null default 'rec' check (direcao in ('rec','prod')), -- rec = L2->PT; prod = PT->L2
  last_review timestamptz,
  created_at timestamptz not null default now(), -- quando o card foi visto pela 1ª vez (teto de novos/dia)
  updated_at timestamptz not null default now()
);

-- Base do foguinho: quantas revisões por dia
create table if not exists public.daily_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  reviews_done integer not null default 0
);

-- ---------- Índices / unicidade ----------
create unique index if not exists idx_card_progress_user_card_dir on public.card_progress (user_id, card_id, direcao);
create index if not exists idx_card_progress_user_due on public.card_progress (user_id, due);
create unique index if not exists idx_daily_activity_user_date on public.daily_activity (user_id, date);
create index if not exists idx_cards_deck on public.cards (deck_id);
create index if not exists idx_cards_language on public.cards (language);
create index if not exists idx_decks_owner on public.decks (owner_id);

-- ---------- Segurança (RLS) ----------
-- RLS LIGADO em todas as tabelas. Na Fase 1 (sem login) as regras são
-- permissivas (o app usa o papel "anon" para ler e gravar). Na Fase 2,
-- com login, estas políticas serão trocadas por regras por usuário
-- (ex.: using (user_id = auth.uid())).
alter table public.profiles enable row level security;
alter table public.decks enable row level security;
alter table public.cards enable row level security;
alter table public.card_progress enable row level security;
alter table public.daily_activity enable row level security;

create policy "fase1_all" on public.profiles for all to anon, authenticated using (true) with check (true);
create policy "fase1_all" on public.decks for all to anon, authenticated using (true) with check (true);
create policy "fase1_all" on public.cards for all to anon, authenticated using (true) with check (true);
create policy "fase1_all" on public.card_progress for all to anon, authenticated using (true) with check (true);
create policy "fase1_all" on public.daily_activity for all to anon, authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

-- ---------- Seed ----------
-- Usuário fixo da Fase 1 (o mesmo USUARIO_ID de js/config.js)
insert into public.profiles (id, display_name)
values ('00000000-0000-4000-8000-000000000001', 'Eduardo')
on conflict (id) do nothing;

-- Baralho de espanhol
insert into public.decks (id, owner_id, language, name)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000001', 'es', 'Espanhol – Básico')
on conflict (id) do nothing;

-- 20 palavras (só insere se o baralho ainda estiver vazio)
insert into public.cards (deck_id, language, type, front, back, tts_lang)
select '00000000-0000-4000-8000-0000000000d1', 'es', 'basic', v.front, v.back, 'es-ES'
from (values
  ('hola','olá'),
  ('gracias','obrigado'),
  ('por favor','por favor'),
  ('buenos días','bom dia'),
  ('la casa','a casa'),
  ('el agua','a água'),
  ('la comida','a comida'),
  ('el perro','o cachorro'),
  ('el gato','o gato'),
  ('la manzana','a maçã'),
  ('el libro','o livro'),
  ('la escuela','a escola'),
  ('el amigo','o amigo'),
  ('la familia','a família'),
  ('el trabajo','o trabalho'),
  ('la ciudad','a cidade'),
  ('el tiempo','o tempo'),
  ('la palabra','a palavra'),
  ('grande','grande'),
  ('pequeño','pequeno')
) as v(front, back)
where not exists (select 1 from public.cards where deck_id = '00000000-0000-4000-8000-0000000000d1');
