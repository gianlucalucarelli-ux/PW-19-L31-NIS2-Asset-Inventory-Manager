// ===========================================================================================
// FILE: src/supabase.js Configurazione e inizializzazione centralizzata del client Supabase.
// ===========================================================================================

const SUPABASE_URL = "https://jacyruehgxjzxufzfoly.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphY3lydWVoZ3hqenh1Znpmb2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MjY3NTEsImV4cCI6MjA5MzQwMjc1MX0.L7WiMfnil2hkso-YrdQE5UXH28Q-XwNLEacv989UKxM";

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);