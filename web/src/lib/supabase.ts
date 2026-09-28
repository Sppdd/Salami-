import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

// The anon key is safe in the browser: row level security scopes every query to the signed-in owner.
export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-anon-key');
