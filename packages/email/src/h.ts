import { createElement, type ReactNode } from "react";

// A loosely-typed `createElement` wrapper. @react-email/components' prop
// types are written for JSX consumption — where children arrive implicitly
// through the JSX transform — and mark `children` as a *required* prop on
// several components (Row among them). That trips TypeScript's stricter
// `createElement` overload resolution the moment children are instead
// passed as trailing arguments, which is this package's only option (no
// JSX at all — see order-confirmation.ts's top comment, DECISIONS.md
// ADR-031). Runtime behavior is identical to a fully-typed call; this only
// avoids re-deriving each component's exact prop type just to erase it
// again with `as never`.
export function h(type: unknown, props: Record<string, unknown> | null, ...children: ReactNode[]) {
  return createElement(type as never, props as never, ...children);
}
