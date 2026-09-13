import { Suspense } from "react";
import { Container, Spinner } from "@ame-de-fil/ui";
import { LoginForm } from "../../../components/login-form";

// Mirrors apps/admin's own /login page shape — LoginForm reads `from` via
// useSearchParams, which requires a Suspense boundary so this route can
// still prerender its static shell.
export default function LoginPage() {
  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center py-16">
      <Suspense fallback={<Spinner />}>
        <LoginForm />
      </Suspense>
    </Container>
  );
}
