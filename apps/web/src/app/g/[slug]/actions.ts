"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { guideCookie, SLUG_RE } from "@/lib/guide";

/** Remembers the guide password in an httpOnly cookie scoped to this guide; the database checks it on every visit. */
export async function unlockGuide(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const password = String(formData.get("password") ?? "").slice(0, 200);
  if (!SLUG_RE.test(slug)) redirect("/");
  const jar = await cookies();
  jar.set(guideCookie(slug), password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/g/${slug}`,
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect(`/g/${slug}`);
}
