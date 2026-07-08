import { createClient } from "@supabase/supabase-js";

// Existing external Supabase project. The publishable (anon) key is safe in client code;
// row-level security on the database enforces real access control.
const SUPABASE_URL = "https://dmezghsowluepmuyerxj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtZXpnaHNvd2x1ZXBtdXllcnhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTE3MDAsImV4cCI6MjA5MzY4NzcwMH0.29IUn39f4-wD40KP5EYCKDAMdoPlvyRnK5SnOjgMB5Q";

export { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY as SUPABASE_ANON_KEY };

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

export type SupabaseClient = typeof supabase;
