import { z } from "zod";

// Shared by both the multipart upload endpoint's non-file fields and the
// JSON PATCH endpoint — multer parses multipart text fields into plain
// strings on req.body before this ever runs, so the same schema (and the
// same ZodValidationPipe) validates both request shapes unchanged.
export const productImageAltTextSchema = z.object({
  altTextSv: z.string().min(1).optional(),
  altTextEn: z.string().min(1).optional(),
});
export type ProductImageAltTextInput = z.infer<typeof productImageAltTextSchema>;
