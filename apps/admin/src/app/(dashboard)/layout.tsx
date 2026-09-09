import type { ReactNode } from "react";
import { SidebarNav } from "../../components/sidebar-nav";

// Protected admin shell (proxy.ts already gates unauthenticated requests
// before they reach this layout — DECISIONS.md ADR-015). Information-dense
// by default vs. the storefront's spacious layout — a deliberate,
// context-driven divergence, not an inconsistency (DESIGN_SYSTEM.md §8).
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr]">
      <aside className="border-r border-neutral-200 p-4">
        <div className="mb-6 px-3 font-display text-lg text-neutral-900">Âme de Fil</div>
        <SidebarNav />
      </aside>
      <main id="main-content" className="px-8 py-8">
        {children}
      </main>
    </div>
  );
}
