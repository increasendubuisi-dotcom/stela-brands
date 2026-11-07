"use client";
import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/env";

let client: ReturnType<typeof createBrowserClient> | undefined;

/** Browser Supabase client acting as the signed-in user (RLS applies). */
export function supabaseBrowser() {
  if (!client) {
    const env = publicEnv();
    client = createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return client;
}
