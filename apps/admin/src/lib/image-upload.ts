// Mirrors admin-products.service.ts's own upload validation exactly — a
// frontend-only nicety so a dropped/selected file that's already known to
// fail is never even handed to the editor; the backend still enforces this
// regardless.
export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
