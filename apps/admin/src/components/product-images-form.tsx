"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Alert,
  Button,
  Card,
  Dialog,
  DialogTrigger,
  DialogContent,
  DragHandleDots2Icon,
  UploadIcon,
  FormField,
  Input,
  Spinner,
  Text,
  cn,
} from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "../lib/image-upload";
import { ImageEditor, type ImageEditorHandle } from "./image-editor";

interface ProductImage {
  id: string;
  url: string;
  altTextSv: string | null;
  altTextEn: string | null;
  position: number;
}

interface ProductImagesFormProps {
  productId: string;
  images: ProductImage[];
}

// Images can only be added once a product exists (the endpoints are
// productId-scoped), so this only ever renders on the Product Detail page,
// never during creation — the create flow already ends with a redirect
// here (create-product-form.tsx). `images` arrives pre-sorted by position
// (ADMIN_PRODUCT_INCLUDE's own `orderBy`).
export function ProductImagesForm({ productId, images }: ProductImagesFormProps) {
  const t = useTranslations("Products.detail.images");
  const router = useRouter();
  // Local, optimistically-reordered copy — dnd-kit needs the array driving
  // the render to actually change on drop, or the dragged card snaps back
  // to its old slot until the PATCH round-trip + router.refresh() lands.
  // Re-synced from the server prop whenever it changes (a refresh from any
  // cause, not just this component's own writes).
  const [orderedImages, setOrderedImages] = useState(images);
  // Adjusted during render rather than in an effect (React's own "adjusting
  // state when a prop changes" recipe) — a plain identity check against the
  // last-seen `images` array, so a server refresh re-syncs the local copy
  // in the same render instead of flashing the stale order for a frame.
  const [prevImages, setPrevImages] = useState(images);
  if (images !== prevImages) {
    setPrevImages(images);
    setOrderedImages(images);
  }
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [reorderErrorKind, setReorderErrorKind] = useState<"generic" | null>(null);

  const sensors = useSensors(
    // A small drag threshold so a click on the handle (e.g. to focus it for
    // keyboard use) never gets misread as an accidental drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Full-list PATCH, not a single "move this one to position N" request —
  // see reorder-product-images.dto.ts's own comment for why: it's the only
  // shape where the server and this optimistic reorder can never disagree
  // about everyone else's position afterward.
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedImages.findIndex((image) => image.id === active.id);
    const newIndex = orderedImages.findIndex((image) => image.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(orderedImages, oldIndex, newIndex);
    setOrderedImages(reordered);
    setReorderErrorKind(null);
    setIsSavingOrder(true);

    const { error } = await api.PATCH("/api/v1/admin/products/{id}/images/order", {
      params: { path: { id: productId } },
      headers: { "x-csrf-token": readCsrfCookie() },
      body: { imageIds: reordered.map((image) => image.id) },
    });
    setIsSavingOrder(false);

    if (error) {
      setOrderedImages(images); // revert to the last known-good server order
      setReorderErrorKind("generic");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {reorderErrorKind ? <Alert tone="danger">{t("reorderError")}</Alert> : null}
      {orderedImages.length === 0 ? (
        <Text size="sm" tone="muted">
          {t("emptyState")}
        </Text>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={orderedImages.map((image) => image.id)}
            strategy={rectSortingStrategy}
          >
            <div
              className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
              aria-busy={isSavingOrder}
            >
              {orderedImages.map((image) => (
                <SortableImageCard key={image.id} productId={productId} image={image} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      <div>
        <UploadImageDialog productId={productId} />
      </div>
    </div>
  );
}

function SortableImageCard({ productId, image }: { productId: string; image: ProductImage }) {
  const t = useTranslations("Products.detail.images");
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
  });
  const [altTextSv, setAltTextSv] = useState(image.altTextSv ?? "");
  const [altTextEn, setAltTextEn] = useState(image.altTextEn ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveErrorKind, setSaveErrorKind] = useState<"generic" | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteErrorKind, setDeleteErrorKind] = useState<"generic" | null>(null);

  async function handleSaveAltText(event: FormEvent) {
    event.preventDefault();
    setSaveErrorKind(null);
    setIsSaving(true);
    const { error } = await api.PATCH("/api/v1/admin/products/{id}/images/{imageId}", {
      params: { path: { id: productId, imageId: image.id } },
      headers: { "x-csrf-token": readCsrfCookie() },
      body: { altTextSv: altTextSv || undefined, altTextEn: altTextEn || undefined },
    });
    setIsSaving(false);
    if (error) {
      setSaveErrorKind("generic");
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    setDeleteErrorKind(null);
    setIsDeleting(true);
    const { error } = await api.DELETE("/api/v1/admin/products/{id}/images/{imageId}", {
      params: { path: { id: productId, imageId: image.id } },
      headers: { "x-csrf-token": readCsrfCookie() },
    });
    setIsDeleting(false);
    if (error) {
      setDeleteErrorKind("generic");
      return;
    }
    setIsDeleteDialogOpen(false);
    router.refresh();
  }

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      // animate-fade-in only ever plays once, right when a brand new card
      // mounts with its own fresh `image.id` key — reordering or editing an
      // existing card never remounts it, so this never replays for those.
      className={cn("animate-fade-in", isDragging ? "relative z-10 opacity-70" : "relative")}
    >
      <div className="flex flex-col gap-3">
        {/* Plain <img>, not next/image — same idiom the storefront already uses
            for product images; no next/image remotePatterns config exists
            (DECISIONS.md ADR-034). */}
        <div className="overflow-hidden rounded-sm border border-neutral-200">
          <img
            src={image.url}
            alt={altTextSv || altTextEn || ""}
            className="aspect-square w-full object-cover transition-transform duration-500 ease-out-slow hover:scale-[1.04]"
            loading="lazy"
          />
        </div>
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex w-fit cursor-grab items-center gap-1.5 rounded-sm px-1 py-1 text-neutral-600 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 active:cursor-grabbing"
        >
          <DragHandleDots2Icon aria-hidden="true" className="h-4 w-4" />
          <Text size="sm">{t("dragHandle")}</Text>
        </button>
        <form onSubmit={handleSaveAltText} className="flex flex-col gap-3">
          {saveErrorKind ? <Alert tone="danger">{t("genericError")}</Alert> : null}
          <FormField label={t("altTextSvLabel")}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                value={altTextSv}
                onChange={(e) => setAltTextSv(e.target.value)}
              />
            )}
          </FormField>
          <FormField label={t("altTextEnLabel")}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                value={altTextEn}
                onChange={(e) => setAltTextEn(e.target.value)}
              />
            )}
          </FormField>
          <div className="flex items-center justify-between gap-2">
            <Button type="submit" variant="secondary" disabled={isSaving}>
              {isSaving ? <Spinner className="h-4 w-4" /> : null} {t("saveAltText")}
            </Button>

            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="ghost">
                  {t("deleteButton")}
                </Button>
              </DialogTrigger>
              <DialogContent
                title={t("deleteConfirmTitle")}
                description={t("deleteConfirmDescription")}
                closeLabel={t("close")}
              >
                {deleteErrorKind ? <Alert tone="danger">{t("genericError")}</Alert> : null}
                <div className="mt-6 flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="danger"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? <Spinner className="h-4 w-4" /> : null} {t("deleteButton")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </form>
      </div>
    </Card>
  );
}

function UploadImageDialog({ productId }: { productId: string }) {
  const t = useTranslations("Products.detail.images");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  // Files dropped or picked at once queue up here; the editor always works
  // on queue[0], and a successful upload shifts it off so the next queued
  // file gets its own turn through the exact same crop/edit/upload flow —
  // one POST per file against the existing single-file endpoint, rather
  // than a new batch endpoint. completedCount only drives the "n of m"
  // progress label, since queue itself shrinks as files are uploaded.
  const [queue, setQueue] = useState<File[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [altTextSv, setAltTextSv] = useState("");
  const [altTextEn, setAltTextEn] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [errorKind, setErrorKind] = useState<"missingFile" | "invalidFile" | "generic" | null>(
    null,
  );
  const editorRef = useRef<ImageEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFile = queue[0] ?? null;
  const totalCount = queue.length + completedCount;

  function reset() {
    setQueue([]);
    setCompletedCount(0);
    setAltTextSv("");
    setAltTextEn("");
    setErrorKind(null);
    setIsDraggingOver(false);
  }

  // Shared by both the file picker's onChange and a native OS drop onto the
  // (invisible, overlaid) file input — browsers already populate a file
  // input's own `files` and fire `change` when something is dropped on it,
  // so both paths land here and go through the identical validate-then-queue
  // logic without any separate drag/drop file-reading code to duplicate.
  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);
    const valid = incoming.filter(
      (candidate) => ALLOWED_IMAGE_TYPES.has(candidate.type) && candidate.size <= MAX_IMAGE_BYTES,
    );
    if (valid.length > 0) {
      setQueue((prev) => [...prev, ...valid]);
    }
    setErrorKind(valid.length < incoming.length ? "invalidFile" : null);
    // Clears the input's own value so selecting/dropping the very same
    // file again still fires onChange a second time.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!currentFile) {
      setErrorKind("missingFile");
      return;
    }

    setErrorKind(null);
    setIsSubmitting(true);

    let blob: Blob;
    try {
      // The edited (cropped/rotated/zoomed/flipped) result, never the
      // original file — this is the whole point of editing before upload:
      // Cloudinary only ever receives what the preview pane already showed.
      blob = await editorRef.current!.exportBlob();
    } catch {
      setIsSubmitting(false);
      setErrorKind("generic");
      return;
    }

    const formData = new FormData();
    formData.append("file", blob, currentFile.name);
    if (altTextSv) formData.append("altTextSv", altTextSv);
    if (altTextEn) formData.append("altTextEn", altTextEn);

    // openapi-fetch's default bodySerializer passes a FormData body through
    // unchanged (and skips setting Content-Type, so the browser adds the
    // multipart boundary itself) — the cast below is only needed because
    // the generated request type describes the *decoded* multipart fields,
    // not the FormData instance actually used to build the request.
    const { error } = await api.POST("/api/v1/admin/products/{id}/images", {
      params: { path: { id: productId } },
      headers: { "x-csrf-token": readCsrfCookie() },
      body: formData as unknown as { file: string; altTextSv?: string; altTextEn?: string },
    });

    if (error) {
      setIsSubmitting(false);
      setErrorKind("generic");
      return;
    }

    const remaining = queue.slice(1);
    setQueue(remaining);
    setCompletedCount((count) => count + 1);
    setAltTextSv("");
    setAltTextEn("");
    setIsSubmitting(false);

    if (remaining.length === 0) {
      setIsOpen(false);
      router.refresh();
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">{t("uploadButton")}</Button>
      </DialogTrigger>
      <DialogContent
        title={t("dialogTitle")}
        description={t("hint")}
        closeLabel={t("close")}
        className="max-w-3xl"
      >
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            {errorKind === "missingFile" ? (
              <Alert tone="danger">{t("missingFileError")}</Alert>
            ) : null}
            {errorKind === "invalidFile" ? (
              <Alert tone="danger">{t("invalidFileError")}</Alert>
            ) : null}
            {errorKind === "generic" ? <Alert tone="danger">{t("genericError")}</Alert> : null}
            {!currentFile ? (
              <FormField label={t("fileLabel")} required>
                {(fieldProps) => (
                  <div className="relative">
                    <div
                      aria-hidden="true"
                      className={cn(
                        "flex flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed p-8 text-center transition duration-300 ease-out-slow",
                        isDraggingOver
                          ? "scale-[1.01] border-accent-500 bg-accent-50"
                          : "border-neutral-300 bg-neutral-50",
                      )}
                    >
                      <UploadIcon className="h-6 w-6 text-neutral-500" />
                      <Text size="sm" tone="muted">
                        {t("dropzoneLabel")}
                      </Text>
                    </div>
                    {/* The real, focusable control — sized to cover the
                        visual dropzone above and left fully transparent, so
                        click, keyboard (Tab + Enter/Space open the native
                        picker) and a native OS file drop all land on one
                        real <input>, not a custom drag-and-drop handler. */}
                    <input
                      {...fieldProps}
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      required
                      onChange={(e) => handleFilesSelected(e.target.files)}
                      onDragEnter={() => setIsDraggingOver(true)}
                      onDragLeave={() => setIsDraggingOver(false)}
                      onDrop={() => setIsDraggingOver(false)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </div>
                )}
              </FormField>
            ) : (
              <>
                {totalCount > 1 ? (
                  <Text size="sm" tone="muted">
                    {t("queueProgress", { current: completedCount + 1, total: totalCount })}
                  </Text>
                ) : null}
                <ImageEditor
                  key={currentFile.name + currentFile.lastModified}
                  ref={editorRef}
                  file={currentFile}
                  defaultAspect="3:4"
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="w-fit"
                  onClick={() => setQueue([])}
                >
                  {t("chooseDifferentFile")}
                </Button>
              </>
            )}
            <FormField label={t("altTextSvLabel")}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  value={altTextSv}
                  onChange={(e) => setAltTextSv(e.target.value)}
                />
              )}
            </FormField>
            <FormField label={t("altTextEnLabel")}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  value={altTextEn}
                  onChange={(e) => setAltTextEn(e.target.value)}
                />
              )}
            </FormField>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button type="submit" disabled={isSubmitting || !currentFile}>
              {isSubmitting ? (
                <>
                  <Spinner className="h-4 w-4" /> {t("submit")}
                </>
              ) : (
                t("submit")
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
