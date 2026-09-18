"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";
import {
  Button,
  RotateCounterClockwiseIcon,
  ResetIcon,
  ZoomInIcon,
  ZoomOutIcon,
  FormField,
  Text,
  VisuallyHidden,
} from "@ame-de-fil/ui";

// Cropper.js's own aspect-ratio convention: a plain width/height ratio, or
// NaN for "free" (no constraint). Shared by every caller (product images,
// homepage hero slides) so the ratio options and their exact numeric values
// never drift between them — only which one is selected by default differs
// per caller (`defaultAspect`).
const ASPECT_RATIOS = {
  "3:4": 3 / 4,
  "4:5": 4 / 5,
  "1:1": 1,
  "4:3": 4 / 3,
  "16:9": 16 / 9,
  "21:9": 21 / 9,
  free: NaN,
} as const;
export type AspectRatioKey = keyof typeof ASPECT_RATIOS;

export interface ImageEditorHandle {
  /** Renders the current crop/rotate/zoom/flip state to a blob of the original file's own type — this, never the original file, is what gets uploaded. */
  exportBlob: () => Promise<Blob>;
}

interface ImageEditorProps {
  file: File;
  /** Which ratio is pre-selected and used for the very first crop box —
   * product photos default to "3:4" (product-card.tsx/PDP's own render
   * ratio); a full-bleed hero banner instead defaults to "16:9". The admin
   * can still switch to any other option from here. */
  defaultAspect: AspectRatioKey;
}

// The one place any admin-uploaded image (product photo or homepage hero
// slide) is edited before it ever reaches Cloudinary — crop, rotate, zoom,
// flip, and a live preview, all via Cropper.js (a plain DOM library, no
// React-specific wrapper needed). Deliberately scoped to *new* uploads only:
// re-editing an image already in Cloudinary would mean re-fetching a remote
// image into a canvas (its own CORS/tainted-canvas handling) and is out of
// scope for this pass.
export const ImageEditor = forwardRef<ImageEditorHandle, ImageEditorProps>(function ImageEditor(
  { file, defaultAspect },
  ref,
) {
  const t = useTranslations("Products.detail.images.editor");
  const imgRef = useRef<HTMLImageElement>(null);
  const cropperRef = useRef<Cropper | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef({ x: 1, y: 1 });
  const [aspect, setAspect] = useState<AspectRatioKey>(defaultAspect);

  // One object URL per selected file — Cropper.js reads the <img>'s own
  // src, it never sees the File object directly. Created *and* revoked
  // inside the same effect (not a useMemo + separate cleanup effect) —
  // React Strict Mode's dev-only double-invoke runs an effect, its
  // cleanup, then the effect again, and a memoized URL revoked by that
  // interim cleanup would stay revoked for the second pass, since the
  // memo itself is never recomputed. Tying create+revoke together means
  // the second pass mints its own fresh URL instead of reusing a dead one.
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  // Deliberate: this isn't state derived from a prop, it's a browser
  // resource (a blob URL) whose creation and revocation must be tied to the
  // same effect run — see the comment above for the Strict Mode bug that
  // splitting them into a useMemo + separate cleanup effect previously
  // caused.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !objectUrl) return;
    flipRef.current = { x: 1, y: 1 };
    const cropper = new Cropper(img, {
      aspectRatio: ASPECT_RATIOS[aspect],
      viewMode: 1,
      autoCropArea: 1,
      preview: previewRef.current ?? undefined,
    });
    cropperRef.current = cropper;
    return () => {
      cropper.destroy();
      cropperRef.current = null;
    };
    // Only re-init when the file itself changes — aspect ratio changes are
    // applied to the live instance below instead of tearing it down, so an
    // in-progress crop/zoom/rotate isn't lost when switching the ratio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectUrl]);

  useEffect(() => {
    cropperRef.current?.setAspectRatio(ASPECT_RATIOS[aspect]);
  }, [aspect]);

  useImperativeHandle(ref, () => ({
    exportBlob: () =>
      new Promise<Blob>((resolve, reject) => {
        const cropper = cropperRef.current;
        if (!cropper) {
          reject(new Error("Image editor is not ready"));
          return;
        }
        cropper
          .getCroppedCanvas({ maxWidth: 2400, maxHeight: 2400, imageSmoothingQuality: "high" })
          .toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error("Could not export the edited image"));
            },
            file.type || "image/jpeg",
            0.92,
          );
      }),
  }));

  const previewAspect = Number.isNaN(ASPECT_RATIOS[aspect]) ? 3 / 4 : ASPECT_RATIOS[aspect];

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="min-w-0 flex-1">
        <div className="max-h-72 overflow-hidden rounded-sm border border-neutral-200 bg-neutral-100">
          {/* Plain <img>, not next/image — Cropper.js needs an element it controls directly. */}
          <img ref={imgRef} src={objectUrl ?? undefined} alt="" className="block max-w-full" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            onClick={() => cropperRef.current?.rotate(-90)}
            title={t("rotateLeft")}
            className="transition hover:scale-110 active:scale-95"
          >
            <RotateCounterClockwiseIcon aria-hidden="true" className="h-4 w-4" />
            <VisuallyHidden>{t("rotateLeft")}</VisuallyHidden>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => cropperRef.current?.rotate(90)}
            title={t("rotateRight")}
            className="transition hover:scale-110 active:scale-95"
          >
            <RotateCounterClockwiseIcon aria-hidden="true" className="h-4 w-4 -scale-x-100" />
            <VisuallyHidden>{t("rotateRight")}</VisuallyHidden>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              flipRef.current.x *= -1;
              cropperRef.current?.scaleX(flipRef.current.x);
            }}
          >
            {t("flipHorizontal")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              flipRef.current.y *= -1;
              cropperRef.current?.scaleY(flipRef.current.y);
            }}
          >
            {t("flipVertical")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              flipRef.current = { x: 1, y: 1 };
              cropperRef.current?.reset();
            }}
            title={t("reset")}
            className="transition hover:scale-110 active:scale-95"
          >
            <ResetIcon aria-hidden="true" className="h-4 w-4" />
            <VisuallyHidden>{t("reset")}</VisuallyHidden>
          </Button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => cropperRef.current?.zoom(-0.1)}
            title={t("zoomOut")}
            className="transition hover:scale-110 active:scale-95"
          >
            <ZoomOutIcon aria-hidden="true" className="h-4 w-4" />
            <VisuallyHidden>{t("zoomOut")}</VisuallyHidden>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => cropperRef.current?.zoom(0.1)}
            title={t("zoomIn")}
            className="transition hover:scale-110 active:scale-95"
          >
            <ZoomInIcon aria-hidden="true" className="h-4 w-4" />
            <VisuallyHidden>{t("zoomIn")}</VisuallyHidden>
          </Button>
          <Text size="sm" tone="muted">
            {t("zoomHint")}
          </Text>
        </div>

        <div className="mt-3 max-w-40">
          <FormField label={t("aspectRatioLabel")}>
            {(fieldProps) => (
              <select
                {...fieldProps}
                value={aspect}
                onChange={(e) => setAspect(e.target.value as AspectRatioKey)}
                className="rounded-sm border border-neutral-300 bg-neutral-50 px-3 py-2 font-sans text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              >
                <option value="3:4">3:4</option>
                <option value="4:5">4:5</option>
                <option value="1:1">1:1</option>
                <option value="4:3">4:3</option>
                <option value="16:9">16:9</option>
                <option value="21:9">21:9</option>
                <option value="free">{t("aspectFree")}</option>
              </select>
            )}
          </FormField>
        </div>
      </div>

      <div className="sm:w-36">
        <Text size="sm" tone="muted">
          {t("previewLabel")}
        </Text>
        <div
          ref={previewRef}
          style={{ aspectRatio: previewAspect }}
          className="mt-1 w-full overflow-hidden rounded-sm border border-neutral-200 bg-neutral-100"
        />
      </div>
    </div>
  );
});
