import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

// Where the email confirmation link lands. Exchanges the one-time code for a session.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const errorDescription = url.searchParams.get("error_description");

  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  if (errorDescription) {
    return to(`/sign-in?error=${encodeURIComponent(errorDescription)}`);
  }
  if (!code) {
    return to("/sign-in?error=" + encodeURIComponent("That link is missing its code. Try signing in."));
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Usually opened in a different browser from the one used to sign up; the email is confirmed anyway.
    return to("/sign-in?confirmed=1");
  }
  return to(next);
}
