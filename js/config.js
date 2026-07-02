/* =========================================================
   config.js — configuração pública do app
   ---------------------------------------------------------
   A URL e a chave "anon" do Supabase são PÚBLICAS: podem ficar
   aqui no código do cliente. Quem protege os dados é o RLS
   (Row Level Security) do Supabase, não o segredo da chave.

   NUNCA coloque aqui a chave "service_role" — essa é secreta.
   ========================================================= */

export const SUPABASE_URL = "https://sbkcnqkwddklrpdxmnxu.supabase.co";

/* Chave "anon" (pública). Existe também a versão nova "publishable"
   (sb_publishable_...) — as duas são públicas e servem; usamos a anon
   por ser a mais compatível com tutoriais e com o supabase-js. */
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNia2NucWt3ZGRrbHJwZHhtbnh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5ODQwOTIsImV4cCI6MjA5ODU2MDA5Mn0.ef2rGwyLaYs8VBaozfzRLQITs0jr_VDVq1iYTej7NWU";

/* Fase 1: um único usuário fixo (sem login ainda).
   Este UUID identifica "quem está estudando" e é igual ao id do
   profile criado no seed. Na Fase 2, o login real assume o lugar
   deste valor fixo (e migramos o progresso para a conta de verdade). */
export const USUARIO_ID = "00000000-0000-4000-8000-000000000001";

/* Quantos cards NOVOS podem entrar por dia no modo Revisão (teto diário). */
export const TETO_CARDS_NOVOS = 20;
