import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell, Field, FormError, SubmitButton } from "@/components/auth-shell";
import { signUp } from "../actions";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AuthShell
      title="Create your account"
      subtitle="Start with a free studio and one live guide."
      footer={
        <>
          Already have an account? <Link href="/sign-in" className="text-accent">Sign in</Link>
        </>
      }
    >
      <FormError message={error} />
      <form action={signUp} className="flex flex-col gap-4">
        <Field label="Your name" name="name" autoComplete="name" />
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="new-password" hint="At least 8 characters." />
        <SubmitButton>Create account</SubmitButton>
      </form>
    </AuthShell>
  );
}
