import type { ReactNode } from "react";
import { getCurrentUser } from "../../lib/dal";
import { SidebarNav } from "../../components/sidebar-nav";
import { SignOutButton } from "../../components/sign-out-button";
import { LanguageSwitcher } from "../../components/language-switcher";

// Protected admin shell — proxy.ts's optimistic cookie-presence check keeps
// a definitely-anonymous request out before it ever reaches this layout,
// but the real, authoritative check is each page's own requireSession()
// call (lib/dal.ts's own comment explains why a layout-only check isn't
// sufficient under App Router partial rendering). This layout calls the
// same cache()-memoized getCurrentUser() only for nav permissions — a
// missing session here renders an empty nav rather than redirecting, since
// redirecting is the child page's job, not the shell's. Information-dense
// by default vs. the storefront's spacious layout — a deliberate,
// context-driven divergence, not an inconsistency (DESIGN_SYSTEM.md §8).
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b border-neutral-200 p-4 md:flex md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-4 px-1 md:mb-6 md:block md:px-3">
          <span className="font-display text-lg text-neutral-900">Âme de Fil</span>
          <div className="md:hidden">
            <SignOutButton />
          </div>
        </div>
        <div className="mt-3 md:hidden">
          <LanguageSwitcher />
        </div>
        <SidebarNav permissions={session?.user.permissions ?? []} />
        <div className="mt-auto hidden flex-col gap-4 pt-4 md:flex">
          <LanguageSwitcher />
          <SignOutButton />
        </div>
      </aside>
      <main id="main-content" className="px-4 py-6 md:px-8 md:py-8">
        {children}
      </main>
    </div>
  );
}
