import { redactSensitiveQueryParams } from "./sanitize-url.ts";

// The session/CSRF cookies travel in the `cookie` request header on every
// authenticated request, a fresh session token rides out in `set-cookie`
// on every login response, and the CSRF double-submit value travels as its
// own `x-csrf-token` request header on every state-changing one
// (DECISIONS.md ADR-032) — pino-http's default request/response
// serializers log headers verbatim, so without this, a session token is
// one log line away from being as good as a stolen cookie (SECURITY.md
// §1/§7: no credentials or session tokens in logs). `req.url` is included
// too — Google's OAuth authorization code travels as a `?code=` query
// parameter on GET /auth/google/callback (DECISIONS.md ADR-033), and
// pino-http's default serializer logs the *raw* URL string (the whole
// query string, unparsed) as its own field, separate from and in addition
// to the parsed `req.query` object — a plain field-removal `redact` (as
// used for the paths above) would have to delete the entire URL to close
// that, losing the path and every other query param for every route, not
// just this one. `pinoRedactCensor` below only replaces the `code=`
// *value* within the URL string instead, via `redactSensitiveQueryParams`
// (also reused by all-exceptions.filter.ts, so an unhandled exception's
// logged/returned URL gets the identical treatment).
export const PINO_REDACT_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'req.headers["x-csrf-token"]',
  "req.query.code",
  "req.url",
  'res.headers["set-cookie"]',
];

// Paths that should disappear from the log entirely (an `undefined`
// return removes the key, the same visible effect `remove: true` would
// have) rather than being replaced with a sanitized value. Deliberately
// *not* achieved via `remove: true` — that pino option can't be combined
// with a per-path `censor` function, and a single `censor` function is
// what makes "remove most paths, but only partially rewrite `req.url`"
// possible without touching `serializers` at all: a `serializers.req`
// override was tried for this (stripping the query string from `url`
// there instead) and confirmed to work for that one field, but it also
// silently dropped `remoteAddress`/`remotePort` from every log line for
// reasons that would need a deeper pino-http-internals investigation to
// pin down. This censor-function approach never touches request
// serialization at all, so remoteAddress/remotePort (and everything else
// pino-http's own default serializer produces) are completely unaffected.
const REMOVE_ENTIRELY = new Set([
  "req.headers.cookie",
  "req.headers.authorization",
  "req.headers.x-csrf-token",
  "req.query.code",
  "res.headers.set-cookie",
]);

export function pinoRedactCensor(value: unknown, path: (string | number)[]): unknown {
  const key = path.join(".");
  if (key === "req.url" && typeof value === "string") {
    return redactSensitiveQueryParams(value);
  }
  if (REMOVE_ENTIRELY.has(key)) return undefined;
  return value;
}
