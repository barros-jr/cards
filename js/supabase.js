/* =========================================================
   supabase.js — cria e exporta o cliente do Supabase.
   Todo o app importa "supabase" daqui para falar com o banco.
   ========================================================= */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
