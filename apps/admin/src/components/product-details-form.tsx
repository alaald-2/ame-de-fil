"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Heading, Button, Alert, FormField, Input, Textarea, Spinner } from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";
import { PRODUCT_CONTENT_PLACEHOLDERS } from "../lib/product-content-placeholders";
import type { TaxonomyOption } from "./create-product-form";

interface TranslationDraft {
  name: string;
  slug: string;
  description: string;
  story: string;
  careInstructions: string;
  materials: string;
  metaTitle: string;
  metaDescription: string;
}

export interface ProductTranslationData {
  locale: "sv-SE" | "en";
  name: string;
  slug: string;
  description: string | null;
  story: string | null;
  careInstructions: string | null;
  materials: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

interface ProductDetailsFormProps {
  productId: string;
  translations: ProductTranslationData[];
  categoryIds: string[];
  collectionIds: string[];
  categories: TaxonomyOption[];
  collections: TaxonomyOption[];
}

function toDraft(t?: ProductTranslationData): TranslationDraft {
  return {
    name: t?.name ?? "",
    slug: t?.slug ?? "",
    description: t?.description ?? "",
    story: t?.story ?? "",
    careInstructions: t?.careInstructions ?? "",
    materials: t?.materials ?? "",
    metaTitle: t?.metaTitle ?? "",
    metaDescription: t?.metaDescription ?? "",
  };
}

type ErrorKind = "duplicateSlug" | "unknownCategory" | "unknownCollection" | "generic" | null;

// Both locales are always submitted together on save — translations? is an
// upsert-per-locale on the backend (admin-products.service.ts), so this
// never wipes a locale not shown here, but since this form always loads
// and displays both, "save" naturally means "persist both as currently
// edited," not a partial patch of just one.
export function ProductDetailsForm({
  productId,
  translations,
  categoryIds: initialCategoryIds,
  collectionIds: initialCollectionIds,
  categories,
  collections,
}: ProductDetailsFormProps) {
  const t = useTranslations("Products.detail");
  const router = useRouter();

  const [drafts, setDrafts] = useState<Record<"sv-SE" | "en", TranslationDraft>>({
    "sv-SE": toDraft(translations.find((tr) => tr.locale === "sv-SE")),
    en: toDraft(translations.find((tr) => tr.locale === "en")),
  });
  const [categoryIds, setCategoryIds] = useState<string[]>(initialCategoryIds);
  const [collectionIds, setCollectionIds] = useState<string[]>(initialCollectionIds);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [saved, setSaved] = useState(false);

  function updateField(locale: "sv-SE" | "en", field: keyof TranslationDraft, value: string) {
    setSaved(false);
    setDrafts((current) => ({ ...current, [locale]: { ...current[locale], [field]: value } }));
  }

  function toggleId(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorKind(null);
    setSaved(false);
    setIsSubmitting(true);

    const { error } = await api.PATCH("/api/v1/admin/products/{id}", {
      params: { path: { id: productId } },
      headers: { "x-csrf-token": readCsrfCookie() },
      body: {
        translations: (["sv-SE", "en"] as const)
          .filter((locale) => drafts[locale].name.trim() && drafts[locale].slug.trim())
          .map((locale) => ({
            locale,
            name: drafts[locale].name,
            slug: drafts[locale].slug,
            description: drafts[locale].description || undefined,
            story: drafts[locale].story || undefined,
            careInstructions: drafts[locale].careInstructions || undefined,
            materials: drafts[locale].materials || undefined,
            metaTitle: drafts[locale].metaTitle || undefined,
            metaDescription: drafts[locale].metaDescription || undefined,
          })),
        categoryIds,
        collectionIds,
      },
    });

    setIsSubmitting(false);

    if (error) {
      const code = (error as { error?: string }).error;
      if (code === "DuplicateSlug") setErrorKind("duplicateSlug");
      else if (code === "UnknownCategory") setErrorKind("unknownCategory");
      else if (code === "UnknownCollection") setErrorKind("unknownCollection");
      else setErrorKind("generic");
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      {errorKind ? (
        <Alert tone="danger">
          {errorKind === "duplicateSlug"
            ? t("duplicateSlugError")
            : errorKind === "unknownCategory"
              ? t("unknownCategoryError")
              : errorKind === "unknownCollection"
                ? t("unknownCollectionError")
                : t("genericError")}
        </Alert>
      ) : null}
      {saved ? <Alert tone="success">{t("savedMessage")}</Alert> : null}

      {(["sv-SE", "en"] as const).map((locale) => (
        <section key={locale}>
          <Heading level={3} className="mb-4">
            {locale === "sv-SE" ? t("translationsSwedish") : t("translationsEnglish")}
          </Heading>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t("nameLabel")} required={locale === "sv-SE"}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  placeholder={PRODUCT_CONTENT_PLACEHOLDERS[locale].name}
                  value={drafts[locale].name}
                  onChange={(e) => updateField(locale, "name", e.target.value)}
                />
              )}
            </FormField>
            <FormField label={t("slugLabel")} required={locale === "sv-SE"}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  value={drafts[locale].slug}
                  onChange={(e) => updateField(locale, "slug", e.target.value)}
                />
              )}
            </FormField>
          </div>
          <div className="mt-4">
            <FormField label={t("descriptionLabel")}>
              {(fieldProps) => (
                <Textarea
                  {...fieldProps}
                  placeholder={PRODUCT_CONTENT_PLACEHOLDERS[locale].description}
                  value={drafts[locale].description}
                  onChange={(e) => updateField(locale, "description", e.target.value)}
                />
              )}
            </FormField>
          </div>
          <div className="mt-4">
            <FormField label={t("storyLabel")}>
              {(fieldProps) => (
                <Textarea
                  {...fieldProps}
                  placeholder={PRODUCT_CONTENT_PLACEHOLDERS[locale].story}
                  value={drafts[locale].story}
                  onChange={(e) => updateField(locale, "story", e.target.value)}
                />
              )}
            </FormField>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FormField label={t("careInstructionsLabel")}>
              {(fieldProps) => (
                <Textarea
                  {...fieldProps}
                  placeholder={PRODUCT_CONTENT_PLACEHOLDERS[locale].careInstructions}
                  value={drafts[locale].careInstructions}
                  onChange={(e) => updateField(locale, "careInstructions", e.target.value)}
                />
              )}
            </FormField>
            <FormField label={t("materialsLabel")}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  placeholder={PRODUCT_CONTENT_PLACEHOLDERS[locale].materials}
                  value={drafts[locale].materials}
                  onChange={(e) => updateField(locale, "materials", e.target.value)}
                />
              )}
            </FormField>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FormField label={t("metaTitleLabel")}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  placeholder={PRODUCT_CONTENT_PLACEHOLDERS[locale].metaTitle}
                  value={drafts[locale].metaTitle}
                  onChange={(e) => updateField(locale, "metaTitle", e.target.value)}
                />
              )}
            </FormField>
            <FormField label={t("metaDescriptionLabel")}>
              {(fieldProps) => (
                <Textarea
                  {...fieldProps}
                  placeholder={PRODUCT_CONTENT_PLACEHOLDERS[locale].metaDescription}
                  value={drafts[locale].metaDescription}
                  onChange={(e) => updateField(locale, "metaDescription", e.target.value)}
                />
              )}
            </FormField>
          </div>
        </section>
      ))}

      {categories.length > 0 || collections.length > 0 ? (
        <section className="grid gap-8 sm:grid-cols-2">
          {categories.length > 0 ? (
            <fieldset>
              <legend className="font-sans text-sm font-medium text-neutral-800">
                {t("categoriesLabel")}
              </legend>
              <div className="mt-2 flex flex-col gap-2">
                {categories.map((category) => (
                  <label
                    key={category.id}
                    className="flex items-center gap-2 text-sm text-neutral-800"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded-sm border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                      checked={categoryIds.includes(category.id)}
                      onChange={() => setCategoryIds((current) => toggleId(current, category.id))}
                    />
                    {category.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          {collections.length > 0 ? (
            <fieldset>
              <legend className="font-sans text-sm font-medium text-neutral-800">
                {t("collectionsLabel")}
              </legend>
              <div className="mt-2 flex flex-col gap-2">
                {collections.map((collection) => (
                  <label
                    key={collection.id}
                    className="flex items-center gap-2 text-sm text-neutral-800"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded-sm border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                      checked={collectionIds.includes(collection.id)}
                      onChange={() =>
                        setCollectionIds((current) => toggleId(current, collection.id))
                      }
                    />
                    {collection.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </section>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner className="h-4 w-4" /> {t("save")}
            </>
          ) : (
            t("save")
          )}
        </Button>
      </div>
    </form>
  );
}
