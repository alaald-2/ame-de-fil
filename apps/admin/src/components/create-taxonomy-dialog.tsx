"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Alert, Dialog, DialogTrigger, DialogContent, FormField, Input, Textarea, Spinner } from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";
import { slugify } from "../lib/slugify";
import { TAXONOMY_CONTENT_PLACEHOLDERS } from "../lib/taxonomy-content-placeholders";

interface TranslationDraft {
  name: string;
  slug: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
}

const EMPTY_DRAFT: TranslationDraft = { name: "", slug: "", description: "", metaTitle: "", metaDescription: "" };

interface CreateTaxonomyDialogProps {
  kind: "categories" | "collections";
}

type ErrorKind = "duplicateSlug" | "generic" | null;

// Shared by /content (categories) and /content/collections — see
// admin-taxonomy-table.tsx's own comment for why Category/Collection are
// handled by one parameterized component rather than duplicated. Small
// enough for a Dialog (unlike Products' full-page create form): just
// translation fields, no options/variants/images.
export function CreateTaxonomyDialog({ kind }: CreateTaxonomyDialogProps) {
  const t = useTranslations(`Content.${kind}.create`);
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<"sv-SE" | "en", TranslationDraft>>({
    "sv-SE": EMPTY_DRAFT,
    en: EMPTY_DRAFT,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  // Same "auto-follow Name until Slug is touched directly" behavior as
  // create-product-form.tsx — see that file's own comment.
  const [slugTouched, setSlugTouched] = useState<Record<"sv-SE" | "en", boolean>>({
    "sv-SE": false,
    en: false,
  });

  function reset() {
    setDrafts({ "sv-SE": EMPTY_DRAFT, en: EMPTY_DRAFT });
    setSlugTouched({ "sv-SE": false, en: false });
    setErrorKind(null);
  }

  function updateField(locale: "sv-SE" | "en", field: keyof TranslationDraft, value: string) {
    if (field === "slug") {
      setSlugTouched((current) => ({ ...current, [locale]: true }));
    }
    setDrafts((current) => {
      const next = { ...current[locale], [field]: value };
      if (field === "name" && !slugTouched[locale]) {
        next.slug = slugify(value);
      }
      return { ...current, [locale]: next };
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorKind(null);
    setIsSubmitting(true);

    const translations = (["sv-SE", "en"] as const)
      .filter((locale) => drafts[locale].name.trim() && drafts[locale].slug.trim())
      .map((locale) => ({
        locale,
        name: drafts[locale].name,
        slug: drafts[locale].slug,
        description: drafts[locale].description || undefined,
        metaTitle: drafts[locale].metaTitle || undefined,
        metaDescription: drafts[locale].metaDescription || undefined,
      }));

    // Two branches (not one dynamic path variable) so the generated client
    // can infer each endpoint's exact literal type — both bodies are
    // identical (createTaxonomySchema, shared on the API side too).
    const { error } =
      kind === "categories"
        ? await api.POST("/api/v1/admin/categories", {
            headers: { "x-csrf-token": readCsrfCookie() },
            body: { translations },
          })
        : await api.POST("/api/v1/admin/collections", {
            headers: { "x-csrf-token": readCsrfCookie() },
            body: { translations },
          });

    setIsSubmitting(false);

    if (error) {
      const code = (error as { error?: string }).error;
      setErrorKind(code === "DuplicateSlug" ? "duplicateSlug" : "generic");
      return;
    }

    setIsOpen(false);
    router.refresh();
  }

  const canSubmit = drafts["sv-SE"].name.trim() && drafts["sv-SE"].slug.trim();

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>{t("submit")}</Button>
      </DialogTrigger>
      <DialogContent title={t("dialogTitle")} description={t("dialogDescription")} closeLabel={t("close")}>
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-6">
            {errorKind ? (
              <Alert tone="danger">{errorKind === "duplicateSlug" ? t("duplicateSlugError") : t("genericError")}</Alert>
            ) : null}

            {(["sv-SE", "en"] as const).map((locale) => (
              <fieldset key={locale} className="flex flex-col gap-4">
                <legend className="font-sans text-sm font-medium text-neutral-800">
                  {locale === "sv-SE" ? t("translationsSwedish") : t("translationsEnglish")}
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label={t("nameLabel")} required={locale === "sv-SE"}>
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        placeholder={TAXONOMY_CONTENT_PLACEHOLDERS[kind][locale].name}
                        value={drafts[locale].name}
                        onChange={(e) => updateField(locale, "name", e.target.value)}
                      />
                    )}
                  </FormField>
                  <FormField label={t("slugLabel")} required={locale === "sv-SE"} hint={t("slugHint")}>
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        placeholder={t("slugPlaceholder")}
                        value={drafts[locale].slug}
                        onChange={(e) => updateField(locale, "slug", e.target.value)}
                      />
                    )}
                  </FormField>
                </div>
                <FormField label={t("descriptionLabel")}>
                  {(fieldProps) => (
                    <Textarea
                      {...fieldProps}
                      placeholder={TAXONOMY_CONTENT_PLACEHOLDERS[kind][locale].description}
                      value={drafts[locale].description}
                      onChange={(e) => updateField(locale, "description", e.target.value)}
                    />
                  )}
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label={t("metaTitleLabel")}>
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        placeholder={TAXONOMY_CONTENT_PLACEHOLDERS[kind][locale].metaTitle}
                        value={drafts[locale].metaTitle}
                        onChange={(e) => updateField(locale, "metaTitle", e.target.value)}
                      />
                    )}
                  </FormField>
                  <FormField label={t("metaDescriptionLabel")}>
                    {(fieldProps) => (
                      <Textarea
                        {...fieldProps}
                        placeholder={TAXONOMY_CONTENT_PLACEHOLDERS[kind][locale].metaDescription}
                        value={drafts[locale].metaDescription}
                        onChange={(e) => updateField(locale, "metaDescription", e.target.value)}
                      />
                    )}
                  </FormField>
                </div>
              </fieldset>
            ))}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button type="submit" disabled={isSubmitting || !canSubmit}>
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
