import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <AuthShell
      title="Check your email"
      footer={<Link href="/sign-in" className="text-accent">Back to sign in</Link>}
    >
      <p className="text-[15px] leading-relaxed">
        We sent a confirmation link to {email ? <strong>{email}</strong> : "your email address"}. Open it on this device to finish creating your account.
      </p>
      <p className="mt-3 text-sm text-muted">Nothing after a few minutes? Check your spam folder.</p>
    </AuthShell>
  );
}
