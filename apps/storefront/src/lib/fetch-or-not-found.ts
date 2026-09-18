// Shared by every server-side detail-page loader (product/category/collection/
// order/address) — a 404 from the API means "render notFound()", any other
// error means something actually went wrong and should throw.
export function unwrapOrNotFound<T>(
  result: { data?: T; error?: unknown; response: Response },
  errorMessage: string,
): T | null {
  if (result.response.status === 404) return null;
  if (result.error || !result.data) throw new Error(errorMessage);
  return result.data;
}
