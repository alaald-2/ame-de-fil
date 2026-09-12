import { Suspense } from "react";
import { Container, Spinner, Logo } from "@ame-de-fil/ui";
import { LoginForm } from "../../components/login-form";
import { LanguageSwitcher } from "../../components/language-switcher";

// Real submission (DECISIONS.md ADR-032) — LoginForm reads `from` via
// useSearchParams, which requires a Suspense boundary so this route can
// still prerender its static shell rather than opting the whole page into
// fully client-side rendering.
// Pre-existing gap surfaced while adding the language switcher below: this
// page had no <main> landmark at all, so the root layout's own
// "Skip to content" link (href="#main-content") pointed at nothing here —
// the committed auth.spec.ts axe check never caught it because it only
// scans the post-login dashboard, never /login itself. Fixed with the same
// id the (dashboard) layout already uses, not a new convention.
export default function LoginPage() {
  return (
    <Container className="relative flex min-h-screen flex-col items-center justify-center">
      <main id="main-content" className="flex flex-col items-center">
        {/* Available before authentication, same as the copy below it — an
            admin must be able to pick their language before they can even
            read the form's own labels. */}
        <LanguageSwitcher className="absolute top-6 right-4 sm:right-6 lg:right-8" />
        {/* Same brand-mark placement as the dashboard sidebar (layout.tsx) —
            the login page has no sidebar of its own, so without this it
            was the only screen in the app carrying zero "Âme de Fil"
            identity. The full lockup (subtitle included), not the sidebar's
            compact crop — this is the one screen with room for it. */}
        <h1 className="mb-8 flex justify-center">
          <Logo variant="full" height={110} />
        </h1>
        <Suspense fallback={<Spinner />}>
          <LoginForm />
        </Suspense>
      </main>
    </Container>
  );
}
