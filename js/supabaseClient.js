// ===============================
// SUPABASE CLIENT
// ===============================

// Settings → API → Project URL
const SUPABASE_URL = "https://qeyyufzjrrswjjsldchy.supabase.co";

// Settings → API → Project API Keys → anon public
const SUPABASE_ANON_KEY = "sb_publishable_lbQFMIaD2cqNP1ejcDRsQA_EIt8fBK0";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);