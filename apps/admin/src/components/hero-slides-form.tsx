"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
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
  Badge,
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
import { ImageEditor, type ImageEditorHandle } from "./image-editor";

interface HeroSlide {
  id: string;
  imageUrl: string;
  position: number;
  isActive: boolean;
  ctaLabelSv: string | null;
  ctaLabelEn: string | null;
  ctaHref: string | null;
}

interface HeroSlidesFormProps {
  slides: HeroSlide[];
  /** Read-only when the viewer only holds marketing.view — no upload
   * dialog, no drag handle, no per-slide edit form, matching
   * product-images-form.tsx's own detail-page permission split (that one
   * gates the whole section on products.update at the page level instead,
   * since images there always sit alongside an already-gated product
   * form; this section can be reached on its own, so the read-only view
   * still needs to render something useful). */
  canManage: boolean;
}

// The Homepage Hero admin section (/content/hero) — closely mirrors
// product-images-form.tsx (upload dialog with the same crop/rotate/zoom
// editor, drag-and-drop reorder), plus the fields a product image doesn't
// need: an isActive toggle (queue a slide or pull it without losing its
// place in the order) and an optional bilingual CTA (label + href).
export function HeroSlidesForm({ slides, canManage }: HeroSlidesFormProps) {
  const t = useTranslations("Content.hero");
  const router = useRouter();
  // Local, optimistically-reordered copy — same reasoning as
  // product-images-form.tsx's own orderedImages.
  const [orderedSlides, setOrderedSlides] = useState(slides);
  const [prevSlides, setPrevSlides] = useState(slides);
  if (slides !== prevSlides) {
    setPrevSlides(slides);
    setOrderedSlides(slides);
  }
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [reorderErrorKind, setReorderErrorKind] = useState<"generic" | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedSlides.findIndex((slide) => slide.id === active.id);
    const newIndex = orderedSlides.findIndex((slide) => slide.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(orderedSlides, oldIndex, newIndex);
    setOrderedSlides(reordered);
    setReorderErrorKind(null);
    setIsSavingOrder(true);

    const { error } = await api.PATCH("/api/v1/admin/hero-slides/order", {
      headers: { "x-csrf-token": readCsrfCookie() },
      body: { slideIds: reordered.map((slide) => slide.id) },
    });
    setIsSavingOrder(false);

    if (error) {
      setOrderedSlides(slides); // revert to the last known-good server order
      setReorderErrorKind("generic");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {reorderErrorKind ? <Alert tone="danger">{t("reorderError")}</Alert> : null}
      {!canManage ? (
        <Text size="sm" tone="muted">
          {t("readOnlyNotice")}
        </Text>
      ) : null}
      {orderedSlides.length === 0 ? (
        <Text size="sm" tone="muted">
          {t("emptyState")}
        </Text>
      ) : canManage ? (
        // Explicit id — without one, dnd-kit seeds its announcer/
        // aria-describedby ids from a module-level counter that increments
        // per DndContext mounted, which differs between the server render
        // and the client's own mount order/count and produces a hydration
        // mismatch. A fixed id makes those ids deterministic instead.
        <DndContext
          id="hero-slides-dnd"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={orderedSlides.map((slide) => slide.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-busy={isSavingOrder}>
              {orderedSlides.map((slide) => (
                <SortableSlideCard key={slide.id} slide={slide} canManage />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {orderedSlides.map((slide) => (
            <SlideCard key={slide.id} slide={slide} canManage={false} />
          ))}
        </div>
      )}
      {canManage ? (
        <div>
          <UploadSlideDialog />
        </div>
      ) : null}
    </div>
  );
}

function SortableSlideCard({ slide, canManage }: { slide: HeroSlide; canManage: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
  });
  const t = useTranslations("Content.hero");

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <SlideCard
        slide={slide}
        canManage={canManage}
        isDragging={isDragging}
        dragHandle={
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="flex w-fit cursor-grab items-center gap-1.5 rounded-sm px-1 py-1 text-neutral-600 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 active:cursor-grabbing"
          >
            <DragHandleDots2Icon aria-hidden="true" className="h-4 w-4" />
            <Text size="sm">{t("dragHandle")}</Text>
          </button>
        }
      />
    </div>
  );
}

function SlideCard({
  slide,
  canManage,
  isDragging,
  dragHandle,
}: {
  slide: HeroSlide;
  canManage: boolean;
  isDragging?: boolean;
  dragHandle?: ReactNode;
}) {
  const t = useTranslations("Content.hero");
  const router = useRouter();
  const [ctaLabelSv, setCtaLabelSv] = useState(slide.ctaLabelSv ?? "");
  const [ctaLabelEn, setCtaLabelEn] = useState(slide.ctaLabelEn ?? "");
  const [ctaHref, setCtaHref] = useState(slide.ctaHref ?? "");
  const [isActive, setIsActive] = useState(slide.isActive);
  const [isSaving, setIsSaving] = useState(false);
  const [saveErrorKind, setSaveErrorKind] = useState<"generic" | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteErrorKind, setDeleteErrorKind] = useState<"generic" | null>(null);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaveErrorKind(null);
    setIsSaving(true);
    const { error } = await api.PATCH("/api/v1/admin/hero-slides/{id}", {
      params: { path: { id: slide.id } },
      headers: { "x-csrf-token": readCsrfCookie() },
      body: {
        ctaLabelSv: ctaLabelSv || undefined,
        ctaLabelEn: ctaLabelEn || undefined,
        ctaHref: ctaHref || undefined,
        isActive,
      },
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
    const { error } = await api.DELETE("/api/v1/admin/hero-slides/{id}", {
      params: { path: { id: slide.id } },
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
      className={cn("animate-fade-in", isDragging ? "relative z-10 opacity-70" : "relative")}
    >
      <div className="flex flex-col gap-3">
        <div className="relative overflow-hidden rounded-sm border border-neutral-200">
          {/* Plain <img>, not next/image — same idiom as product-images-form.tsx. */}
          <img
            src={slide.imageUrl}
            alt=""
            className="aspect-[16/9] w-full object-cover transition-transform duration-500 ease-out-slow hover:scale-[1.04]"
            loading="lazy"
          />
          {!slide.isActive ? (
            <Badge tone="neutral" className="absolute top-2 left-2">
              {t("inactiveBadge")}
            </Badge>
          ) : null}
        </div>
        {dragHandle}
        {canManage ? (
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            {saveErrorKind ? <Alert tone="danger">{t("genericError")}</Alert> : null}
            <label className="flex items-center gap-2 text-sm text-neutral-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded-sm border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              {t("activeLabel")}
            </label>
            <FormField label={t("ctaLabelSvLabel")}>
              {(fieldProps) => (
                <Input {...fieldProps} value={ctaLabelSv} onChange={(e) => setCtaLabelSv(e.target.value)} />
              )}
            </FormField>
            <FormField label={t("ctaLabelEnLabel")}>
              {(fieldProps) => (
                <Input {...fieldProps} value={ctaLabelEn} onChange={(e) => setCtaLabelEn(e.target.value)} />
              )}
            </FormField>
            <FormField label={t("ctaHrefLabel")} hint={t("ctaHrefHint")}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  value={ctaHref}
                  onChange={(e) => setCtaHref(e.target.value)}
                  placeholder="/shop"
                />
              )}
            </FormField>
            <div className="flex items-center justify-between gap-2">
              <Button type="submit" variant="secondary" disabled={isSaving}>
                {isSaving ? <Spinner className="h-4 w-4" /> : null} {t("saveButton")}
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
                    <Button type="button" variant="danger" onClick={handleDelete} disabled={isDeleting}>
                      {isDeleting ? <Spinner className="h-4 w-4" /> : null} {t("deleteButton")}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </form>
        ) : null}
      </div>
    </Card>
  );
}

// Mirrors admin-hero-slides.service.ts's own upload validation exactly.
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function UploadSlideDialog() {
  const t = useTranslations("Content.hero");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [queue, setQueue] = useState<File[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [ctaLabelSv, setCtaLabelSv] = useState("");
  const [ctaLabelEn, setCtaLabelEn] = useState("");
  const [ctaHref, setCtaHref] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [errorKind, setErrorKind] = useState<"missingFile" | "invalidFile" | "generic" | null>(null);
  const editorRef = useRef<ImageEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFile = queue[0] ?? null;
  const totalCount = queue.length + completedCount;

  function reset() {
    setQueue([]);
    setCompletedCount(0);
    setCtaLabelSv("");
    setCtaLabelEn("");
    setCtaHref("");
    setErrorKind(null);
    setIsDraggingOver(false);
  }

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
      blob = await editorRef.current!.exportBlob();
    } catch {
      setIsSubmitting(false);
      setErrorKind("generic");
      return;
    }

    const formData = new FormData();
    formData.append("file", blob, currentFile.name);
    if (ctaLabelSv) formData.append("ctaLabelSv", ctaLabelSv);
    if (ctaLabelEn) formData.append("ctaLabelEn", ctaLabelEn);
    if (ctaHref) formData.append("ctaHref", ctaHref);

    // See product-images-form.tsx's own comment for why this cast exists —
    // openapi-fetch's default bodySerializer passes FormData through
    // unchanged, but the generated type describes the decoded fields.
    const { error } = await api.POST("/api/v1/admin/hero-slides", {
      headers: { "x-csrf-token": readCsrfCookie() },
      body: formData as unknown as { file: string; ctaLabelSv?: string; ctaLabelEn?: string; ctaHref?: string },
    });

    if (error) {
      setIsSubmitting(false);
      setErrorKind("generic");
      return;
    }

    const remaining = queue.slice(1);
    setQueue(remaining);
    setCompletedCount((count) => count + 1);
    setCtaLabelSv("");
    setCtaLabelEn("");
    setCtaHref("");
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
            {errorKind === "missingFile" ? <Alert tone="danger">{t("missingFileError")}</Alert> : null}
            {errorKind === "invalidFile" ? <Alert tone="danger">{t("invalidFileError")}</Alert> : null}
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
                  defaultAspect="16:9"
                />
                <Button type="button" variant="ghost" className="w-fit" onClick={() => setQueue([])}>
                  {t("chooseDifferentFile")}
                </Button>
              </>
            )}
            <FormField label={t("ctaLabelSvLabel")}>
              {(fieldProps) => (
                <Input {...fieldProps} value={ctaLabelSv} onChange={(e) => setCtaLabelSv(e.target.value)} />
              )}
            </FormField>
            <FormField label={t("ctaLabelEnLabel")}>
              {(fieldProps) => (
                <Input {...fieldProps} value={ctaLabelEn} onChange={(e) => setCtaLabelEn(e.target.value)} />
              )}
            </FormField>
            <FormField label={t("ctaHrefLabel")} hint={t("ctaHrefHint")}>
              {(fieldProps) => (
                <Input {...fieldProps} value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} placeholder="/shop" />
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
