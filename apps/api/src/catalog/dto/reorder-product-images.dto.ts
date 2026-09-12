import { z } from "zod";

// The full, ordered list of a product's own image ids — not a single "move
// this one to position N" edit, since that risks the caller and the server
// disagreeing about where everyone else ends up after a partial change.
// The service rejects anything that isn't exactly the product's current
// image set, each listed once (admin-products.service.ts's own
// reorderImages) — position 0..N-1 is then assigned from array order.
export const reorderProductImagesSchema = z.object({
  imageIds: z.array(z.string().min(1)).min(1),
});
export type ReorderProductImagesInput = z.infer<typeof reorderProductImagesSchema>;
