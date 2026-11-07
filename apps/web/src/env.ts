import { z } from "zod";

/**
 * Environment access. Public values may reach the browser; server values must
 * only be read in server code (route handlers, server actions, server components).
 * Validation is lazy so the app can build without a configured Supabase project.
 */

const PublicEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_GUIDE_BASE_URL: z.url().default("http://localhost:3000/g"),
});

const ServerEnv = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

export type PublicEnv = z.infer<typeof PublicEnv>;

export function publicEnv(): PublicEnv {
  // Referenced individually so Next can inline them into client bundles.
  return PublicEnv.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
    NEXT_PUBLIC_GUIDE_BASE_URL: process.env.NEXT_PUBLIC_GUIDE_BASE_URL || undefined,
  });
}

export function isSupabaseConfigured(): boolean {
  return PublicEnv.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }).success;
}

export function serverEnv(): z.infer<typeof ServerEnv> {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must never run in the browser");
  }
  return ServerEnv.parse({ SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY });
}
