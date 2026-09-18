# API Reference — Âme de Fil

A human-readable catalog of every route `apps/api` exposes. This is a companion to the generated
OpenAPI document, not a replacement for it — for exact request/response JSON Schemas, use the
live Swagger UI (`GET /api/docs`, non-production environments only — `bootstrap-config.ts`'s
`shouldExposeApiDocs`) or the generated `packages/types` client types
(`pnpm --filter @ame-de-fil/api run export-openapi` then `pnpm --filter @ame-de-fil/types run generate`).
Both are produced from the same `@ApiOperation`/`@ApiZodQuery`/`@ApiZodParam`/`@ApiErrorResponses`
decorators on the controllers below, so this document and the generated schema should never
structurally disagree — if they do, the controller (and the regenerated OpenAPI doc) is the source
of truth, and this file is stale and needs a pass.

## Conventions used below

- **Path** — relative to the API origin. Every route is served under the `/api/v1` prefix
  (`bootstrap-config.ts`'s `API_PREFIX`) **except** `/health`, which is deliberately unversioned so
  a load balancer/orchestrator probe never needs to know the API version (`DEPLOYMENT.md` §5).
- **Auth** column:
  - `Public` — no session required (`@Public()`), reachable by anyone.
  - `Optional` — works with or without a session (`@OptionalAuth()`); behavior branches on whether
    one is present (e.g. cart/checkout serve both guests and signed-in customers).
  - `Session` — a valid `ame_session` cookie is required; default-deny otherwise
    (`SessionAuthGuard`, `SECURITY.md` §2). This is every route not marked `Public`/`Optional`.
- **Permission** column — the exact `@RequirePermissions(...)` string, checked by `PermissionsGuard`
  after `SessionAuthGuard`. A blank cell means the route needs a valid session but no specific
  permission (e.g. "my own addresses/orders," gated by `AuthContext.userId` ownership, not RBAC).
- **Errors** column — every non-2xx status the route's own `@ApiErrorResponses(...)` documents,
  i.e. genuinely reachable through that route's guard chain and service logic, not a generic
  "anything could fail" list. Every error body shares one envelope
  (`common/api-error-responses.ts`'s `ERROR_ENVELOPE_SCHEMA`, enforced at runtime by
  `AllExceptionsFilter`): `{ statusCode, error, message, correlationId, timestamp, path, ...extra }`.
- State-changing routes that mutate money or inventory in a way a retried request must never
  double-apply require an `Idempotency-Key` header (checkout's own initiate, and admin's refund) —
  called out per-route below.
- CSRF: any state-changing request made *with* a session cookie present must also carry a
  `X-CSRF-Token` header matching the token issued at login (`CsrfGuard`, double-submit pattern,
  `SECURITY.md` §3). This is a header on top of the session cookie, not a separate route — omitted
  from the per-route tables below since it applies uniformly to every `Session`-scoped
  state-changing route (and to `Optional`/`Public` routes only once a session cookie is actually
  present).

---

## Public / storefront-facing

### Health

| Method & Path | Summary | Auth | Errors |
| --- | --- | --- | --- |
| `GET /health` | Liveness/readiness probe (checks the database) | Public | 503 |

### Catalog

`apps/api/src/catalog/{products,categories,collections}.controller.ts` — read-only, only
`PUBLISHED` products/categories/collections are ever returned.

| Method & Path | Summary | Auth | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/products` | List published products, optionally filtered by category/collection/search term | Public | 400 |
| `GET /api/v1/products/{slug}` | Get a published product by its locale-specific slug | Public | 400, 404 |
| `GET /api/v1/categories` | List all categories | Public | 400 |
| `GET /api/v1/categories/{slug}` | Get a category by slug, with its published products | Public | 400, 404 |
| `GET /api/v1/collections` | List all collections | Public | 400 |
| `GET /api/v1/collections/{slug}` | Get a collection by slug, with its published products | Public | 400, 404 |

### Marketing (public)

`apps/api/src/marketing/{hero-slides,homepage-sections}.controller.ts` — only active
slides/content are ever returned.

| Method & Path | Summary | Auth | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/hero-slides` | List active homepage hero slides, in display order | Public | 400 |
| `GET /api/v1/homepage-sections` | Get the site's four named content sections (hero, story, made-to-order, announcement) | Public | 400 |

### Shipping

`apps/api/src/shipping/shipping.controller.ts` — must be reachable pre-checkout, before a guest
has authenticated.

| Method & Path | Summary | Auth | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/shipping-methods` | List active shipping methods with their flat-rate price | Public | 400 |
| `GET /api/v1/shipping-methods/{shippingMethodId}/pickup-points` | List pickup points (ombud/paketbox) near a postal code | Public | 400 |

### Cart

`apps/api/src/cart/cart.controller.ts` — identity is a guest-cart cookie or the caller's session,
resolved server-side (`resolveCartIdentity`/`resolveOrCreateCartIdentity`), never trusted from the
client.

| Method & Path | Summary | Auth | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/cart` | Get the current cart (guest or signed-in) — never creates one | Optional | 400, 401 |
| `POST /api/v1/cart/items` | Add a variant to the cart, creating a guest cart cookie if needed (201) | Optional | 400, 401, 403 |
| `PATCH /api/v1/cart/items/{itemId}` | Update a cart line's quantity | Optional | 400, 401, 403, 404 |
| `DELETE /api/v1/cart/items/{itemId}` | Remove a line from the cart | Optional | 400, 401, 403, 404 |

### Checkout

`apps/api/src/checkout/checkout.controller.ts`.

| Method & Path | Summary | Auth | Errors |
| --- | --- | --- | --- |
| `POST /api/v1/checkout` | Initiate checkout from the caller's own current cart (201). Requires `Idempotency-Key` header. A signed-in customer with an unverified email gets a distinct 403 `EmailNotVerified` (never applies to a guest) | Optional | 400, 401, 403, 409, 429 |

### Payments webhook

`apps/api/src/payments/payments-webhook.controller.ts` — `@ApiExcludeController()`: not a
client-facing endpoint (only Stripe calls it), so it carries no `@ApiErrorResponses` and is absent
from the generated Swagger document entirely.

| Method & Path | Summary | Auth | Notes |
| --- | --- | --- | --- |
| `POST /api/v1/payments/webhooks/stripe` | Stripe webhook receiver | Public (verified by `Stripe-Signature` header, not a session) | `@SkipCsrf()`; not rate-limited (Stripe's own delivery cadence governs volume, `PAYMENTS.md` §5); always returns `{ received: true }` once processing completes without throwing, including for event types it ignores |

### Auth

`apps/api/src/identity/auth.controller.ts`.

| Method & Path | Summary | Auth | Errors |
| --- | --- | --- | --- |
| `POST /api/v1/auth/login` | Authenticate with email/password, issuing a session cookie. Rate-limited 5/min/IP | Public | 400, 401, 429 |
| `POST /api/v1/auth/login-method` | Which credential this email uses next — password or a one-time code (no side effects) | Public | 400, 429 |
| `POST /api/v1/auth/otp/request` | Email a one-time sign-in code — always returns the same generic response (enumeration-safe) | Public | 400, 429 |
| `POST /api/v1/auth/otp/verify` | Consume a one-time sign-in code, issuing a session cookie | Public | 400, 429 |
| `POST /api/v1/auth/register` | Create a password account — always returns the same generic response (201, enumeration-safe, never auto-logs-in) | Public | 400, 429 |
| `POST /api/v1/auth/verify-email` | Consume an email-verification token | Public | 400 |
| `POST /api/v1/auth/resend-verification` | Resend the email-verification link — always returns the same generic response | Public | 400, 429 |
| `POST /api/v1/auth/forgot-password` | Request a password-reset email — always returns the same generic response | Public | 400, 429 |
| `POST /api/v1/auth/reset-password` | Consume a password-reset token and set a new password | Public | 400, 429 |
| `POST /api/v1/auth/logout` | Invalidate the caller's current session (204) | Session | 401, 403 |
| `GET /api/v1/auth/session` | The caller's own current session, or `{ authenticated: false }` | Optional | 401 |
| `GET /api/v1/auth/google` | Start the Google OAuth flow (redirect) | Public | excluded from Swagger docs (`@ApiExcludeEndpoint()`) — browser navigation, never a JSON API call |
| `GET /api/v1/auth/google/callback` | Google OAuth callback (redirect) | Public | excluded from Swagger docs — every failure path redirects back to the storefront with a fixed `authError` reason instead of a JSON error |

### Addresses (the caller's own)

`apps/api/src/addresses/addresses.controller.ts` — scoped entirely by `AuthContext.userId`, never
permission-gated (this is "my own data," not an admin privilege).

| Method & Path | Summary | Auth | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/addresses` | List the caller's own saved addresses | Session | 401 |
| `GET /api/v1/addresses/{addressId}` | Get one of the caller's own saved addresses | Session | 400, 401, 404 |
| `POST /api/v1/addresses` | Save a new address (201) | Session | 400, 401, 422 |
| `PATCH /api/v1/addresses/{addressId}` | Update one of the caller's own saved addresses | Session | 400, 401, 404 |
| `DELETE /api/v1/addresses/{addressId}` | Delete one of the caller's own saved addresses (204) | Session | 400, 401, 404 |

### Orders (the caller's own)

`apps/api/src/orders/orders.controller.ts` — same "my own data" posture as addresses.

| Method & Path | Summary | Auth | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/orders` | List the caller's own orders, most recent first | Session | 400, 401 |
| `GET /api/v1/orders/{orderId}` | Full detail for one of the caller's own orders | Session | 400, 401, 404 |
| `GET /api/v1/orders/{orderId}/status` | Minimal order/payment status for storefront polling — no addresses, line items, or amounts. A guest caller authorizes via `X-Order-Status-Token` header instead of a session; rate-limited 5/sec/IP | Optional | 400, 401, 404, 429 |

---

## Admin (`/api/v1/admin/*`)

Every admin controller is `Session`-scoped, default-deny, and additionally permission-gated
(`PermissionsGuard`, `SECURITY.md` §2) — there is no admin route reachable without both a valid
session **and** the specific permission listed. None of these are `@Public()`/`@OptionalAuth()`.

### Dashboard

`apps/api/src/dashboard/dashboard.controller.ts`.

| Method & Path | Summary | Permission | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/admin/dashboard` | Overview — revenue, orders, payments, refunds, customers, alerts | `dashboard.view` | 400, 401, 403 |

### Catalog — products

`apps/api/src/catalog/admin-products.controller.ts` — `products.view`/`.create`/`.update`/`.delete`
split (finer-grained than most admin domains, reflecting genuinely different risk levels).

| Method & Path | Summary | Permission | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/admin/products` | List products (admin), most recently updated first, optionally filtered to one status | `products.view` | 400, 401, 403 |
| `GET /api/v1/admin/products/variants` | List every non-archived variant, for pickers (e.g. the Promotions admin UI) | `products.view` | 400, 401, 403 |
| `GET /api/v1/admin/products/{id}` | Get a product's full editable content (every locale, all variants) | `products.view` | 400, 401, 403, 404 |
| `POST /api/v1/admin/products` | Create a product with its translations, options, and variants (201) | `products.create` | 400, 401, 403 |
| `PATCH /api/v1/admin/products/{id}` | Update a product's translations, category/collection membership, status, or existing variants' fields | `products.update` | 400, 401, 403, 404, 409 |
| `POST /api/v1/admin/products/{id}/images` | Upload a product image (JPEG/PNG/WebP, 5MB max) (201) | `products.update` | 400, 401, 403, 404 |
| `PATCH /api/v1/admin/products/{id}/images/order` | Reorder a product's images (the full, ordered list of image ids) | `products.update` | 400, 401, 403, 404 |
| `PATCH /api/v1/admin/products/{id}/images/{imageId}` | Update a product image's alt text | `products.update` | 400, 401, 403, 404 |
| `DELETE /api/v1/admin/products/{id}/images/{imageId}` | Delete a product image (204) | `products.update` | 400, 401, 403, 404 |
| `DELETE /api/v1/admin/products/{id}` | Delete a product outright — only when never ordered/added to a live cart; use `status=ARCHIVED` for anything that has sold (204) | `products.delete` | 400, 401, 403, 404, 409 |

### Catalog — categories, collections, tax classes

`apps/api/src/catalog/admin-{categories,collections,tax-classes}.controller.ts` — categories and
collections share one view/manage permission pair each (not split further — no route here carries
the risk profile that justified products' finer split).

| Method & Path | Summary | Permission | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/admin/categories` | List categories with product counts, most recently updated first | `categories.view` | 400, 401, 403 |
| `GET /api/v1/admin/categories/{id}` | Get a category's full editable content (every locale) | `categories.view` | 400, 401, 403, 404 |
| `POST /api/v1/admin/categories` | Create a category with its translations (201) | `categories.manage` | 400, 401, 403, 409 |
| `PATCH /api/v1/admin/categories/{id}` | Update a category's translations | `categories.manage` | 400, 401, 403, 404, 409 |
| `DELETE /api/v1/admin/categories/{id}` | Delete a category; blocked (409) while any product is tagged with it (204) | `categories.manage` | 400, 401, 403, 404, 409 |
| `GET /api/v1/admin/collections` | List collections with product counts, most recently updated first | `collections.view` | 400, 401, 403 |
| `GET /api/v1/admin/collections/{id}` | Get a collection's full editable content (every locale) | `collections.view` | 400, 401, 403, 404 |
| `POST /api/v1/admin/collections` | Create a collection with its translations (201) | `collections.manage` | 400, 401, 403, 409 |
| `PATCH /api/v1/admin/collections/{id}` | Update a collection's translations | `collections.manage` | 400, 401, 403, 404, 409 |
| `DELETE /api/v1/admin/collections/{id}` | Delete a collection; blocked (409) while any product is tagged with it (204) | `collections.manage` | 400, 401, 403, 404, 409 |
| `GET /api/v1/admin/tax-classes` | List every tax class (id, code, name) — reference data for product/variant editing | `products.view` | 401, 403 |

### Orders & fulfillment

`apps/api/src/orders/admin-orders.controller.ts` — `orders.view`/`.fulfill`/`.refund` split, kept
separate so a role can be granted one without the others.

| Method & Path | Summary | Permission | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/admin/orders` | List orders, most recent first — optionally filtered to a matching payment/refund status | `orders.view` | 400, 401, 403 |
| `GET /api/v1/admin/orders/export` | Download a CSV of confirmed orders in a date range, for accounting (`text/csv`, streamed via `@Res()`) | `orders.view` | 400, 401, 403 |
| `GET /api/v1/admin/orders/{orderId}` | Get full order detail — items, payments, shipments, addresses | `orders.view` | 400, 401, 403, 404 |
| `POST /api/v1/admin/orders/{orderId}/ready-to-ship` | Mark a `CONFIRMED` order as ready to ship | `orders.fulfill` | 400, 401, 403, 409 — see note below |
| `POST /api/v1/admin/orders/{orderId}/ship` | Mark a `READY_TO_SHIP` order as shipped, recording carrier/tracking (real carrier shipment creation, `DECISIONS.md` ADR-039) | `orders.fulfill` | 400, 401, 403, 409 — see note below |
| `POST /api/v1/admin/orders/{orderId}/deliver` | Mark a `SHIPPED` order as delivered | `orders.fulfill` | 400, 401, 403, 409 |
| `POST /api/v1/admin/orders/{orderId}/refund` | Issue an amount-based refund against an order's payment. Requires `Idempotency-Key` header | `orders.refund` | 400, 401, 403, 404, 409, 422 |

> **Known bug, not fixed by this pass (documentation-only):** `ready-to-ship` and `ship` do not
> actually reach a 404 for a nonexistent order id — both call `findUniqueOrThrow` ahead of any
> guard, which throws a raw Prisma "record not found" error that `AllExceptionsFilter` turns into
> an **undocumented 500**, not a 404. Their docs above are corrected to omit the false 404 and
> match current behavior; the underlying fix (wrapping that lookup in a proper `NotFoundException`)
> would be an Orders *behavior* change, out of scope for a documentation-only pass and tracked
> separately. `deliver` never had this specific bug — a missing order and a wrong-status order both
> already hit the same guarded `updateMany` and produce the same 409.

### Checkout ops (admin)

`apps/api/src/checkout/admin-checkout.controller.ts` — the manual/ops-triggered complement to
`ReservationExpiryScheduler`'s automatic sweep; idempotent, safe to call repeatedly or
concurrently.

| Method & Path | Summary | Permission | Errors |
| --- | --- | --- | --- |
| `POST /api/v1/admin/checkout/expire-reservations` | Release expired stock reservations and cancel their orders | `checkout.manage` | 401, 403 |

### Inventory

`apps/api/src/inventory/inventory.controller.ts`.

| Method & Path | Summary | Permission | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/admin/inventory` | List inventory items with stock/availability | `inventory.view` | 400, 401, 403 |
| `GET /api/v1/admin/inventory/low-stock` | List finite-stock items where `onHand - reserved` is below their `lowStockThreshold` | `inventory.view` | 400, 401, 403 |
| `GET /api/v1/admin/inventory/reservations` | List stock reservations, soonest-to-expire first (`PENDING` by default) | `inventory.view` | 400, 401, 403 |
| `GET /api/v1/admin/inventory/movements` | Cross-item inventory movement ledger, most recent first | `inventory.view` | 400, 401, 403 |
| `GET /api/v1/admin/inventory/{variantId}` | Get one variant's inventory item with recent movement history | `inventory.view` | 400, 401, 403, 404 |
| `POST /api/v1/admin/inventory/{variantId}/adjustments` | Adjust `onHand` stock for a variant, recorded as an `InventoryMovement` (201) | `inventory.adjust` | 400, 401, 403, 404 |

### Marketing (admin)

`apps/api/src/marketing/admin-{hero-slides,homepage-sections}.controller.ts` —
`marketing.view`/`.manage` split.

| Method & Path | Summary | Permission | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/admin/hero-slides` | List every homepage hero slide (active or not), in display order | `marketing.view` | 401, 403 |
| `POST /api/v1/admin/hero-slides` | Upload a new homepage hero slide (JPEG/PNG/WebP, 5MB max) (201) | `marketing.manage` | 400, 401, 403 |
| `PATCH /api/v1/admin/hero-slides/order` | Reorder hero slides (the full, ordered list of slide ids) | `marketing.manage` | 400, 401, 403 |
| `PATCH /api/v1/admin/hero-slides/{id}` | Update a hero slide's CTA fields and/or active state | `marketing.manage` | 400, 401, 403, 404 |
| `DELETE /api/v1/admin/hero-slides/{id}` | Delete a hero slide (204) | `marketing.manage` | 400, 401, 403, 404 |
| `GET /api/v1/admin/homepage-sections` | Get the site's four named content sections (hero, story, made-to-order, announcement) | `marketing.view` | 401, 403 |
| `POST /api/v1/admin/homepage-sections/{key}/image` | Upload (or replace) a homepage section's image (JPEG/PNG/WebP, 5MB max) (201) | `marketing.manage` | 400, 401, 403 |
| `DELETE /api/v1/admin/homepage-sections/{key}/image` | Remove a homepage section's image (reverts to the storefront's placeholder) | `marketing.manage` | 400, 401, 403 |
| `PATCH /api/v1/admin/homepage-sections/{key}` | Update a homepage section's text content (eyebrow/title/description/CTA) | `marketing.manage` | 400, 401, 403 |

### Promotions

`apps/api/src/promotions/promotions.controller.ts` — `promotions.view`/`.manage` split; no delete
route at all (`Promotion` can be deactivated but never removed — `OrderItem.promotionId` is a real
FK to it).

| Method & Path | Summary | Permission | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/admin/promotions` | List promotions, most recently updated first | `promotions.view` | 400, 401, 403 |
| `GET /api/v1/admin/promotions/{id}` | Get a promotion and the variants it applies to | `promotions.view` | 400, 401, 403, 404 |
| `POST /api/v1/admin/promotions` | Create a percentage promotion and attach it to one or more variants (201) | `promotions.manage` | 400, 401, 403, 409 |
| `PATCH /api/v1/admin/promotions/{id}` | Update a promotion's name/percentage/dates/active state and/or replace its full variant set | `promotions.manage` | 400, 401, 403, 404, 409 |
| `DELETE /api/v1/admin/promotions/{id}/variants/{variantId}` | Detach one variant from a promotion — a thin wrapper around the same `update()` path as the route above | `promotions.manage` | 400, 401, 403, 404, 409 |

### Customers

`apps/api/src/customers/admin-customers.controller.ts` — read-only.

| Method & Path | Summary | Permission | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/admin/customers` | List customers, most recently registered first | `customers.view` | 400, 401, 403 |
| `GET /api/v1/admin/customers/{id}` | Get customer profile detail, with recent order history | `customers.view` | 400, 401, 403, 404 |

### Users & roles

`apps/api/src/users/admin-{users,roles}.controller.ts` — `users.view`/`.manage`/`.manage_roles`
split; `.manage_roles` is kept separate from `.manage` since it's the one escalation-capable
action. `AdminRolesController` is read-only — creating a role or editing a role's own permission
set stays seed-script-only in v1 (approved scope).

| Method & Path | Summary | Permission | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/admin/roles` | List every role and the permissions it grants | `users.manage_roles` | 401, 403 |
| `GET /api/v1/admin/users` | List staff users (accounts holding at least one role), most recently created first | `users.view` | 400, 401, 403 |
| `GET /api/v1/admin/users/{id}` | Get a staff user's roles, effective permissions, and status | `users.view` | 400, 401, 403, 404 |
| `POST /api/v1/admin/users` | Create a new staff user — password is server-generated and returned once. Rate-limited 5/min (201) | `users.manage` | 400, 401, 403, 404, 409, 429 |
| `POST /api/v1/admin/users/{id}/activate` | Reactivate a deactivated user | `users.manage` | 400, 401, 403, 404, 409 |
| `POST /api/v1/admin/users/{id}/deactivate` | Deactivate a user and revoke their existing sessions | `users.manage` | 400, 401, 403, 404, 409 |
| `POST /api/v1/admin/users/{id}/roles` | Assign an existing role to a user | `users.manage_roles` | 400, 401, 403, 404, 409 |
| `DELETE /api/v1/admin/users/{id}/roles/{roleId}` | Remove a role from a user | `users.manage_roles` | 400, 401, 403, 404, 409 |

> `POST /api/v1/admin/users`'s 404 is `RoleNotFound` — genuinely reachable when `initialRoleIds`
> references a role that doesn't exist (`admin-users.service.ts`'s `createUser`).

### Tasks

`apps/api/src/tasks/admin-tasks.controller.ts` — `tasks.view`/`.manage` split.

| Method & Path | Summary | Permission | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/admin/tasks` | List tasks, soonest-due first (`OPEN` by default) | `tasks.view` | 400, 401, 403 |
| `GET /api/v1/admin/tasks/assignees` | List active staff users eligible to be assigned a task | `tasks.view` | 401, 403 |
| `GET /api/v1/admin/tasks/{id}` | Get one task | `tasks.view` | 400, 401, 403, 404 |
| `POST /api/v1/admin/tasks` | Create a manual task (201) | `tasks.manage` | 400, 401, 403 |
| `PATCH /api/v1/admin/tasks/{id}` | Edit a task's title/notes/due date | `tasks.manage` | 400, 401, 403, 404 |
| `POST /api/v1/admin/tasks/{id}/assign` | Assign, reassign, or unassign (`assignedToUserId: null`) a task | `tasks.manage` | 400, 401, 403, 404 |
| `POST /api/v1/admin/tasks/{id}/complete` | Mark an `OPEN` task as done | `tasks.manage` | 400, 401, 403, 404, 409 |
| `POST /api/v1/admin/tasks/{id}/reopen` | Reopen a `DONE` or `CANCELED` task back to `OPEN` | `tasks.manage` | 400, 401, 403, 404, 409 |
| `POST /api/v1/admin/tasks/{id}/cancel` | Cancel an `OPEN` task | `tasks.manage` | 400, 401, 403, 404, 409 |

### Store settings

`apps/api/src/settings/admin-store-settings.controller.ts` — the store's own business info
(name/address/org number/VAT number), printed on the order receipt. `settings.view`/`.manage`
split.

| Method & Path | Summary | Permission | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/admin/store-settings` | Get the store's business info and receipt display settings | `settings.view` | 401, 403 |
| `PATCH /api/v1/admin/store-settings` | Update the store's business info and receipt display settings | `settings.manage` | 400, 401, 403 |

### Audit log

`apps/api/src/audit/admin-audit-log.controller.ts` — read-only; `audit.view` is its own
permission (not folded into any other), since the audit trail reveals other admins' actions and
IPs, a more sensitive privilege than viewing orders/inventory.

| Method & Path | Summary | Permission | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/admin/audit-log` | List audit log entries, most recent first | `audit.view` | 400, 401, 403 |

---

## Keeping this file in sync

This file was generated by reading every `*.controller.ts` under `apps/api/src` against the
codebase as of the cleanup pass in `DECISIONS.md`/git history around this commit. Whenever a
route's path, permission, or documented error set changes, update the matching row here in the
same change — there's no automated check that keeps this specific file current, unlike the
generated OpenAPI document (which is regenerated from the decorators directly and can't drift).
