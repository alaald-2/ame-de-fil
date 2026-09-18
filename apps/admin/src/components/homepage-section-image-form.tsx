"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  Button,
  Card,
  Dialog,
  DialogTrigger,
  DialogContent,
  UploadIcon,
  FormField,
  PlaceholderImage,
  Spinner,
  Text,
  cn,
} from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "../lib/image-upload";
import { ImageEditor, type ImageEditorHandle } from "./image-editor";

export interface HomepageSectionImageFormProps {
  slug: "story" | "made-to-order";
  label: string;
  imageUrl: string | null;
  canManage: boolean;
}

// One named image slot for a fixed homepage section (page.tsx's "Our
// craft"/"Made to order" blocks) — unlike HeroSlidesForm this is never a
// list: no reorder, no CTA fields (that copy is UI content, next-intl), no
// add/remove-from-a-set, just "replace this one image" or "clear it back
// to the storefront's placeholder."
export function HomepageSectionImageForm({
  slug,
  label,
  imageUrl,
  canManage,
}: HomepageSectionImageFormProps) {
  const t = useTranslations("Content.homepageImages");
  const router = useRouter();
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeErrorKind, setRemoveErrorKind] = useState<"generic" | null>(null);

  async function handleRemove() {
    setRemoveErrorKind(null);
    setIsRemoving(true);
    const { error } = await api.DELETE("/api/v1/admin/homepage-sections/{key}/image", {
      params: { path: { key: slug } },
      headers: { "x-csrf-token": readCsrfCookie() },
    });
    setIsRemoving(false);
    if (error) {
      setRemoveErrorKind("generic");
      return;
    }
    setIsRemoveDialogOpen(false);
    router.refresh();
  }

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <Text size="sm" className="font-medium text-neutral-900">
          {label}
        </Text>
        <div className="overflow-hidden rounded-sm border border-neutral-200">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="aspect-[4/5] w-full object-cover"
              loading="lazy"
            />
          ) : (
            <PlaceholderImage className="aspect-[4/5] w-full" />
          )}
        </div>
        {canManage ? (
          <>
            {removeErrorKind ? <Alert tone="danger">{t("genericError")}</Alert> : null}
            <div className="flex items-center justify-between gap-2">
              <UploadImageDialog slug={slug} hasImage={Boolean(imageUrl)} />
              {imageUrl ? (
                <Dialog open={isRemoveDialogOpen} onOpenChange={setIsRemoveDialogOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" variant="ghost">
                      {t("removeButton")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent
                    title={t("removeConfirmTitle")}
                    description={t("removeConfirmDescription")}
                    closeLabel={t("close")}
                  >
                    <div className="mt-6 flex justify-end gap-3">
                      <Button
                        type="button"
                        variant="danger"
                        onClick={handleRemove}
                        disabled={isRemoving}
                      >
                        {isRemoving ? <Spinner className="h-4 w-4" /> : null} {t("removeButton")}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}

function UploadImageDialog({
  slug,
  hasImage,
}: {
  slug: "story" | "made-to-order";
  hasImage: boolean;
}) {
  const t = useTranslations("Content.homepageImages");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [errorKind, setErrorKind] = useState<"missingFile" | "invalidFile" | "generic" | null>(
    null,
  );
  const editorRef = useRef<ImageEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setErrorKind(null);
    setIsDraggingOver(false);
  }

  function handleFileSelected(fileList: FileList | null) {
    const candidate = fileList?.[0];
    if (!candidate) return;
    if (!ALLOWED_IMAGE_TYPES.has(candidate.type) || candidate.size > MAX_IMAGE_BYTES) {
      setErrorKind("invalidFile");
    } else {
      setErrorKind(null);
      setFile(candidate);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
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
    formData.append("file", blob, file.name);

    // See product-images-form.tsx's own comment for why this cast exists.
    const { error } = await api.POST("/api/v1/admin/homepage-sections/{key}/image", {
      params: { path: { key: slug } },
      headers: { "x-csrf-token": readCsrfCookie() },
      body: formData as unknown as { file: string },
    });

    setIsSubmitting(false);
    if (error) {
      setErrorKind("generic");
      return;
    }

    setIsOpen(false);
    router.refresh();
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
        <Button variant="secondary">{hasImage ? t("replaceButton") : t("uploadButton")}</Button>
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
            {!file ? (
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
                      required
                      onChange={(e) => handleFileSelected(e.target.files)}
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
                <ImageEditor
                  key={file.name + file.lastModified}
                  ref={editorRef}
                  file={file}
                  defaultAspect="4:5"
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="w-fit"
                  onClick={() => setFile(null)}
                >
                  {t("chooseDifferentFile")}
                </Button>
              </>
            )}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button type="submit" disabled={isSubmitting || !file}>
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
