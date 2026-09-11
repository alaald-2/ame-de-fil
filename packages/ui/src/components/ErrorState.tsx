import { Heading } from "./Heading";
import { Text } from "./Text";
import { Link } from "./Link";
import { cn } from "../utils/cn";

interface ErrorStateProps {
  title: string;
  description?: string;
  /** A plain link back to the same URL forces a fresh server render — no
   * client state needed, since every consumer today is a Server Component. */
  retryHref?: string;
  retryLabel?: string;
  className?: string;
}

// Shared shell for both technical failures and permission (403) denials —
// the two share the same quiet, non-alarming presentation; only the copy
// differs per call site. Deliberately not `role="alert"` — this renders as
// part of the page's own content on load, not an interruption of something
// already in progress (Alert's own tone="danger" is the interrupting case).
//
// level={2}: same reasoning as EmptyState.tsx's own comment — every real
// usage renders this directly under a page's <h1>, with no <h2> in between.
export function ErrorState({ title, description, retryHref, retryLabel, className }: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 py-20 text-center", className)}>
      <Heading level={2}>{title}</Heading>
      {description ? <Text tone="muted" className="max-w-sm">{description}</Text> : null}
      {retryHref && retryLabel ? (
        <Link href={retryHref} className="mt-4">
          {retryLabel}
        </Link>
      ) : null}
    </div>
  );
}
