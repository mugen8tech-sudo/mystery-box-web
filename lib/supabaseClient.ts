import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client untuk dipakai di komponen client-side (login, dll.)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
