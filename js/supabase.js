/*
=========================================
 CONFIGURACIÓN SUPABASE (CORRECTA)
=========================================
*/

const SUPABASE_URL = "https://wunmtdabodzbihzduecp.supabase.co";

const SUPABASE_ANON_KEY = "sb_publishable_wNiYes_ZurIxgc2aOOpBaQ_o20nOZbO";

/*
=========================================
 CREAR CLIENTE
=========================================
*/

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

console.log("Supabase conectado:", supabaseClient);