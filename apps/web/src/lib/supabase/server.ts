import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv, serverEnv } from "@/env";

/** Supabase client acting as the signed-in user (RLS applies). Use in server components and actions. */
export async function supabaseServer() {
  const env = publicEnv();
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a server component, where cookies are read-only. The proxy refreshes sessions.
        }
      },
    },
  });
}

/**
 * Service-role client: bypasses RLS. Only for narrowly scoped server tasks
 * (signing download URLs for a published snapshot, payment webhooks). Never
 * pass user input straight into it without checking access first.
 */
export function supabaseAdmin() {
  const env = publicEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
