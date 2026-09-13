import { z } from "zod";

// The full, ordered list of every hero slide's id — not a single "move this
// one to position N" edit, same reasoning as reorder-product-images.dto.ts:
// it's the only shape where the server and an optimistic client-side
// reorder can never disagree about everyone else's position afterward.
export const reorderHeroSlidesSchema = z.object({
  slideIds: z.array(z.string().min(1)).min(1),
});
export type ReorderHeroSlidesInput = z.infer<typeof reorderHeroSlidesSchema>;
