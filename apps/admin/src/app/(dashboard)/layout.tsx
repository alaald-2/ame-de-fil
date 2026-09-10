import type { ReactNode } from "react";
import { getCurrentUser } from "../../lib/dal";
import { SidebarNav } from "../../components/sidebar-nav";
import { SignOutButton } from "../../components/sign-out-button";

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
    <div className="grid min-h-screen grid-cols-[240px_1fr]">
      <aside className="flex flex-col border-r border-neutral-200 p-4">
        <div className="mb-6 px-3 font-display text-lg text-neutral-900">Âme de Fil</div>
        <SidebarNav permissions={session?.user.permissions ?? []} />
        <div className="mt-auto pt-4">
          <SignOutButton />
        </div>
      </aside>
      <main id="main-content" className="px-8 py-8">
        {children}
      </main>
    </div>
  );
}
