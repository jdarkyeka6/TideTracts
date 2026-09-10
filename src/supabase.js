import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://vwgfohrtgharvqcndruw.supabase.co";
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_d-tBa1Bh4EFS58WZTHkujA_bubnmA6z";
export const SIGN_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/tidetracts-sign`;

const client = createClient(SUPABASE_URL, SUPABASE_KEY);

// Wavo accounts are stored in Supabase Auth using the synthetic
// `<username>@wavo.app` email format. Wavo itself converts usernames to that
// address before calling signInWithPassword. TideTracts accepts either a Wavo
// username or a real email and mirrors that behaviour here.
const signInWithPassword = client.auth.signInWithPassword.bind(client.auth);
client.auth.signInWithPassword = (credentials = {}) => {
  const raw = String(credentials.email || "").trim().toLowerCase();
  const email = raw && !raw.includes("@") ? `${raw}@wavo.app` : raw;
  return signInWithPassword({ ...credentials, email });
};

export const supabase = client;
