"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requestOrigin, safeNext } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

const withError = (path: string, message: string, extra: Record<string, string> = {}) =>
  `${path}?${new URLSearchParams({ error: message, ...extra }).toString()}`;

const SignUp = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters for your password").max(72),
});

export async function signUp(formData: FormData) {
  const parsed = SignUp.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(withError("/sign-up", parsed.error.issues[0]?.message ?? "Check your details"));

  const supabase = await supabaseServer();
  const origin = await requestOrigin();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name },
      emailRedirectTo: `${origin}/auth/callback?next=/dashboard`,
    },
  });
  if (error) redirect(withError("/sign-up", error.message));

  // Email confirmation on: no session yet. Off: signed in straight away.
  if (!data.session) redirect(`/check-email?email=${encodeURIComponent(parsed.data.email)}`);
  redirect("/dashboard");
}

const SignIn = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export async function signIn(formData: FormData) {
  const parsed = SignIn.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(withError("/sign-in", parsed.error.issues[0]?.message ?? "Check your details"));

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    const message = error.code === "email_not_confirmed"
      ? "Confirm your email first. Check your inbox for the link."
      : "That email and password don't match an account.";
    redirect(withError("/sign-in", message, parsed.data.next ? { next: parsed.data.next } : {}));
  }
  redirect(safeNext(parsed.data.next));
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
