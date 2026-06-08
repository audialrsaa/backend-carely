import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validasi biar gampang debug
if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum di .env");
}

// EXPORT HARUS PAKAI NAMA 'supabase'
export const supabase = createClient(supabaseUrl, supabaseKey);