import { Suspense } from "react";
import { Container, Spinner } from "@ame-de-fil/ui";
import { LoginForm } from "../../components/login-form";

// Real submission (DECISIONS.md ADR-032) — LoginForm reads `from` via
// useSearchParams, which requires a Suspense boundary so this route can
// still prerender its static shell rather than opting the whole page into
// fully client-side rendering.
export default function LoginPage() {
  return (
    <Container className="flex min-h-screen items-center justify-center">
      <Suspense fallback={<Spinner />}>
        <LoginForm />
      </Suspense>
    </Container>
  );
}
