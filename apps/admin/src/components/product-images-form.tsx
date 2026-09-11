"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  Button,
  Card,
  Dialog,
  DialogTrigger,
  DialogContent,
  FormField,
  Input,
  Spinner,
  Text,
} from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";

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
// here (create-product-form.tsx). Position is append-only for this pass;
// reordering isn't built (see DECISIONS.md ADR-034's checkpoint notes).
export function ProductImagesForm({ productId, images }: ProductImagesFormProps) {
  const t = useTranslations("Products.detail.images");

  return (
    <div className="flex flex-col gap-6">
      {images.length === 0 ? (
        <Text size="sm" tone="muted">
          {t("emptyState")}
        </Text>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => (
            <ProductImageCard key={image.id} productId={productId} image={image} />
          ))}
        </div>
      )}
      <div>
        <UploadImageDialog productId={productId} />
      </div>
    </div>
  );
}

function ProductImageCard({ productId, image }: { productId: string; image: ProductImage }) {
  const t = useTranslations("Products.detail.images");
  const router = useRouter();
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
    <Card className="flex flex-col gap-3">
      {/* Plain <img>, not next/image — same idiom the storefront already uses
          for product images; no next/image remotePatterns config exists
          (DECISIONS.md ADR-034). */}
      <img
        src={image.url}
        alt={altTextSv || altTextEn || ""}
        className="aspect-square w-full rounded-sm border border-neutral-200 object-cover"
        loading="lazy"
      />
      <form onSubmit={handleSaveAltText} className="flex flex-col gap-3">
        {saveErrorKind ? <Alert tone="danger">{t("genericError")}</Alert> : null}
        <FormField label={t("altTextSvLabel")}>
          {(fieldProps) => (
            <Input {...fieldProps} value={altTextSv} onChange={(e) => setAltTextSv(e.target.value)} />
          )}
        </FormField>
        <FormField label={t("altTextEnLabel")}>
          {(fieldProps) => (
            <Input {...fieldProps} value={altTextEn} onChange={(e) => setAltTextEn(e.target.value)} />
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
                <Button type="button" onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? <Spinner className="h-4 w-4" /> : null} {t("deleteButton")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </form>
    </Card>
  );
}

function UploadImageDialog({ productId }: { productId: string }) {
  const t = useTranslations("Products.detail.images");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [altTextSv, setAltTextSv] = useState("");
  const [altTextEn, setAltTextEn] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<"missingFile" | "generic" | null>(null);

  function reset() {
    setFile(null);
    setAltTextSv("");
    setAltTextEn("");
    setErrorKind(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setErrorKind("missingFile");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    if (altTextSv) formData.append("altTextSv", altTextSv);
    if (altTextEn) formData.append("altTextEn", altTextEn);

    setErrorKind(null);
    setIsSubmitting(true);
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
        <Button variant="secondary">{t("uploadButton")}</Button>
      </DialogTrigger>
      <DialogContent title={t("dialogTitle")} description={t("hint")} closeLabel={t("close")}>
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            {errorKind === "missingFile" ? <Alert tone="danger">{t("missingFileError")}</Alert> : null}
            {errorKind === "generic" ? <Alert tone="danger">{t("genericError")}</Alert> : null}
            <FormField label={t("fileLabel")} required>
              {(fieldProps) => (
                <input
                  {...fieldProps}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="rounded-sm border border-neutral-300 text-sm text-neutral-800 file:mr-3 file:rounded-sm file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium"
                />
              )}
            </FormField>
            <FormField label={t("altTextSvLabel")}>
              {(fieldProps) => (
                <Input {...fieldProps} value={altTextSv} onChange={(e) => setAltTextSv(e.target.value)} />
              )}
            </FormField>
            <FormField label={t("altTextEnLabel")}>
              {(fieldProps) => (
                <Input {...fieldProps} value={altTextEn} onChange={(e) => setAltTextEn(e.target.value)} />
              )}
            </FormField>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button type="submit" disabled={isSubmitting}>
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
