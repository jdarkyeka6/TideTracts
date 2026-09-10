import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://vwgfohrtgharvqcndruw.supabase.co";
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_d-tBa1Bh4EFS58WZTHkujA_bubnmA6z";
export const SIGN_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/tidetracts-sign`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export function wavoLoginEmail(identifier) {
  const value = String(identifier || "").trim().toLowerCase();
  return value && !value.includes("@") ? `${value}@wavo.app` : value;
}

export function signInWithWavo(identifier, password) {
  return supabase.auth.signInWithPassword({
    email: wavoLoginEmail(identifier),
    password,
  });
}
