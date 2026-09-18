"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Heading,
  Text,
  Button,
  Alert,
  FormField,
  Input,
  Textarea,
  Card,
  Spinner,
} from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";
import { slugify } from "../lib/slugify";
import { PRODUCT_CONTENT_PLACEHOLDERS } from "../lib/product-content-placeholders";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "../lib/image-upload";

export interface TaxonomyOption {
  id: string;
  name: string;
}

export interface TaxClassOption {
  id: string;
  code: string;
  name: string;
}

interface CreateProductFormProps {
  categories: TaxonomyOption[];
  collections: TaxonomyOption[];
  taxClasses: TaxClassOption[];
}

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

const EMPTY_TRANSLATION: TranslationDraft = {
  name: "",
  slug: "",
  description: "",
  story: "",
  careInstructions: "",
  materials: "",
  metaTitle: "",
  metaDescription: "",
};

interface OptionValueDraft {
  clientId: string;
  value: string;
  labelSv: string;
  labelEn: string;
}

interface OptionDraft {
  clientId: string;
  key: string;
  values: OptionValueDraft[];
}

interface VariantDraft {
  clientId: string;
  sku: string;
  priceMinor: string;
  taxClassCode: string;
  weightGrams: string;
  selectedOptionValues: Record<string, string>;
  initialStock: string;
  tracksStock: boolean;
  isLimitedEdition: boolean;
  productionTimeDays: string;
}

let clientIdCounter = 0;
function nextClientId(): string {
  clientIdCounter += 1;
  return `c${clientIdCounter}`;
}

interface StagedImage {
  clientId: string;
  file: File;
  previewUrl: string;
}

function emptyVariant(defaultTaxClassCode: string): VariantDraft {
  return {
    clientId: nextClientId(),
    sku: "",
    priceMinor: "",
    taxClassCode: defaultTaxClassCode,
    weightGrams: "",
    selectedOptionValues: {},
    initialStock: "0",
    tracksStock: true,
    isLimitedEdition: false,
    productionTimeDays: "",
  };
}

type CreateErrorKind =
  | "duplicateSku"
  | "invalidOptionSelection"
  | "unknownTaxClass"
  | "unknownCategory"
  | "unknownCollection"
  | "generic"
  | null;

// One-shot creation matching POST /admin/products' own DTO exactly
// (translations + options + variants + category/collection ids all in one
// request, same as create-product.dto.ts) — there's no draft-save/step
// wizard, since the backend has no partial-create endpoint to save into.
export function CreateProductForm({ categories, collections, taxClasses }: CreateProductFormProps) {
  const t = useTranslations("Products.create");
  const router = useRouter();
  const defaultTaxClassCode = taxClasses[0]?.code ?? "";

  const [translations, setTranslations] = useState<Record<"sv-SE" | "en", TranslationDraft>>({
    "sv-SE": { ...EMPTY_TRANSLATION },
    en: { ...EMPTY_TRANSLATION },
  });
  const [showEnglish, setShowEnglish] = useState(false);
  // Tracks whether the admin has ever typed into Slug directly, per locale —
  // until they do, Slug auto-follows Name (new product, no existing slug to
  // protect). The moment they touch Slug themselves, auto-generation stops
  // for that locale so their edit is never silently overwritten.
  const [slugTouched, setSlugTouched] = useState<Record<"sv-SE" | "en", boolean>>({
    "sv-SE": false,
    en: false,
  });
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [variants, setVariants] = useState<VariantDraft[]>([emptyVariant(defaultTaxClassCode)]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<CreateErrorKind>(null);

  // Images can only be attached to a product that already exists (the
  // upload endpoint is productId-scoped) — there's no backend change here.
  // Files picked on this page are staged locally (never uploaded yet) and
  // only sent, one request per file, right after the product is created
  // successfully. A file rejected by size/type is dropped before staging so
  // the admin sees the problem immediately, not after an otherwise-successful
  // create. Skipping images entirely (stagedImages stays empty) changes
  // nothing about the existing create-then-redirect behavior below.
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const [rejectedImageNames, setRejectedImageNames] = useState<string[]>([]);
  // Set only when the product was created but one or more staged images
  // failed to upload — the form is replaced with a summary instead of
  // staying interactive, since resubmitting it would create a duplicate
  // product (the real one already exists at this point).
  const [createdProductId, setCreatedProductId] = useState<string | null>(null);
  const [failedImageNames, setFailedImageNames] = useState<string[]>([]);

  function updateTranslation(locale: "sv-SE" | "en", field: keyof TranslationDraft, value: string) {
    if (field === "slug") {
      setSlugTouched((current) => ({ ...current, [locale]: true }));
    }
    setTranslations((current) => {
      const next = { ...current[locale], [field]: value };
      if (field === "name" && !slugTouched[locale]) {
        next.slug = slugify(value);
      }
      return { ...current, [locale]: next };
    });
  }

  function addOption() {
    setOptions((current) => [...current, { clientId: nextClientId(), key: "", values: [] }]);
  }

  function removeOption(clientId: string) {
    setOptions((current) => current.filter((o) => o.clientId !== clientId));
    // Any variant selection referencing this option's key is now stale —
    // dropped below at submit time via the current options list, not here,
    // so the visible key/value labels stay intact until the admin re-saves.
  }

  function updateOptionKey(clientId: string, key: string) {
    setOptions((current) => current.map((o) => (o.clientId === clientId ? { ...o, key } : o)));
  }

  function addOptionValue(optionClientId: string) {
    setOptions((current) =>
      current.map((o) =>
        o.clientId === optionClientId
          ? {
              ...o,
              values: [
                ...o.values,
                { clientId: nextClientId(), value: "", labelSv: "", labelEn: "" },
              ],
            }
          : o,
      ),
    );
  }

  function removeOptionValue(optionClientId: string, valueClientId: string) {
    setOptions((current) =>
      current.map((o) =>
        o.clientId === optionClientId
          ? { ...o, values: o.values.filter((v) => v.clientId !== valueClientId) }
          : o,
      ),
    );
  }

  function updateOptionValue(
    optionClientId: string,
    valueClientId: string,
    field: keyof Omit<OptionValueDraft, "clientId">,
    fieldValue: string,
  ) {
    setOptions((current) =>
      current.map((o) =>
        o.clientId === optionClientId
          ? {
              ...o,
              values: o.values.map((v) =>
                v.clientId === valueClientId ? { ...v, [field]: fieldValue } : v,
              ),
            }
          : o,
      ),
    );
  }

  function addVariant() {
    setVariants((current) => [...current, emptyVariant(defaultTaxClassCode)]);
  }

  function removeVariant(clientId: string) {
    setVariants((current) => current.filter((v) => v.clientId !== clientId));
  }

  function updateVariant<K extends keyof VariantDraft>(
    clientId: string,
    field: K,
    value: VariantDraft[K],
  ) {
    setVariants((current) =>
      current.map((v) => (v.clientId === clientId ? { ...v, [field]: value } : v)),
    );
  }

  // Keyed by the option's stable clientId, not its freely-editable key text —
  // otherwise renaming an option's key after a variant already selected one
  // of its values would silently orphan that selection under the old key
  // string (see handleSubmit, which resolves clientId -> current key).
  function updateVariantOptionSelection(
    variantClientId: string,
    optionClientId: string,
    valueSlug: string,
  ) {
    setVariants((current) =>
      current.map((v) =>
        v.clientId === variantClientId
          ? {
              ...v,
              selectedOptionValues: { ...v.selectedOptionValues, [optionClientId]: valueSlug },
            }
          : v,
      ),
    );
  }

  function toggleId(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  function handleImagesSelected(fileList: FileList | null) {
    if (!fileList) return;
    const accepted: StagedImage[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(fileList)) {
      if (!ALLOWED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES) {
        rejected.push(file.name);
        continue;
      }
      accepted.push({ clientId: nextClientId(), file, previewUrl: URL.createObjectURL(file) });
    }
    setStagedImages((current) => [...current, ...accepted]);
    setRejectedImageNames(rejected);
  }

  function removeStagedImage(clientId: string) {
    setStagedImages((current) => {
      const target = current.find((img) => img.clientId === clientId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((img) => img.clientId !== clientId);
    });
  }

  // Shared between the always-visible Swedish fields and the English ones
  // revealed behind the "Add English content" toggle below — same field
  // set, only the locale (and whether Swedish's name/slug are required)
  // differs.
  function renderTranslationFields(locale: "sv-SE" | "en") {
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("nameLabel")} required={locale === "sv-SE"}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                placeholder={PRODUCT_CONTENT_PLACEHOLDERS[locale].name}
                value={translations[locale].name}
                onChange={(e) => updateTranslation(locale, "name", e.target.value)}
              />
            )}
          </FormField>
          <FormField label={t("slugLabel")} required={locale === "sv-SE"} hint={t("slugHint")}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                placeholder={t("slugPlaceholder")}
                value={translations[locale].slug}
                onChange={(e) => updateTranslation(locale, "slug", e.target.value)}
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
                value={translations[locale].description}
                onChange={(e) => updateTranslation(locale, "description", e.target.value)}
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
                value={translations[locale].story}
                onChange={(e) => updateTranslation(locale, "story", e.target.value)}
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
                value={translations[locale].careInstructions}
                onChange={(e) => updateTranslation(locale, "careInstructions", e.target.value)}
              />
            )}
          </FormField>
          <FormField label={t("materialsLabel")}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                placeholder={PRODUCT_CONTENT_PLACEHOLDERS[locale].materials}
                value={translations[locale].materials}
                onChange={(e) => updateTranslation(locale, "materials", e.target.value)}
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
                value={translations[locale].metaTitle}
                onChange={(e) => updateTranslation(locale, "metaTitle", e.target.value)}
              />
            )}
          </FormField>
          <FormField label={t("metaDescriptionLabel")}>
            {(fieldProps) => (
              <Textarea
                {...fieldProps}
                placeholder={PRODUCT_CONTENT_PLACEHOLDERS[locale].metaDescription}
                value={translations[locale].metaDescription}
                onChange={(e) => updateTranslation(locale, "metaDescription", e.target.value)}
              />
            )}
          </FormField>
        </div>
      </>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorKind(null);
    setIsSubmitting(true);

    const body = {
      translations: (Object.entries(translations) as ["sv-SE" | "en", TranslationDraft][])
        .filter(([, draft]) => draft.name.trim() && draft.slug.trim())
        .map(([locale, draft]) => ({
          locale,
          name: draft.name,
          slug: draft.slug,
          description: draft.description || undefined,
          story: draft.story || undefined,
          careInstructions: draft.careInstructions || undefined,
          materials: draft.materials || undefined,
          metaTitle: draft.metaTitle || undefined,
          metaDescription: draft.metaDescription || undefined,
        })),
      options: options
        .filter((o) => o.key.trim())
        .map((o) => ({
          key: o.key,
          values: o.values
            .filter((v) => v.value.trim())
            .map((v) => ({ value: v.value, labelSv: v.labelSv, labelEn: v.labelEn })),
        })),
      variants: variants.map((v) => {
        // Resolve each option's stable clientId to its current key text here,
        // at submit time — this is also where a selection referencing an
        // option the admin has since removed gets dropped (see removeOption).
        const selectedOptionValues: Record<string, string> = {};
        for (const option of options) {
          const key = option.key.trim();
          const valueSlug = v.selectedOptionValues[option.clientId];
          if (key && valueSlug) selectedOptionValues[key] = valueSlug;
        }
        return {
          sku: v.sku.trim() || undefined,
          priceMinor: Math.round(Number.parseFloat(v.priceMinor || "0") * 100),
          taxClassCode: v.taxClassCode,
          weightGrams: v.weightGrams ? Number.parseInt(v.weightGrams, 10) : undefined,
          selectedOptionValues,
          initialStock: Number.parseInt(v.initialStock || "0", 10),
          tracksStock: v.tracksStock,
          isLimitedEdition: v.isLimitedEdition,
          productionTimeDays: v.productionTimeDays
            ? Number.parseInt(v.productionTimeDays, 10)
            : undefined,
        };
      }),
      categoryIds,
      collectionIds,
    };

    const { data, error, response } = await api.POST("/api/v1/admin/products", {
      headers: { "x-csrf-token": readCsrfCookie() },
      body,
    });

    if (error) {
      setIsSubmitting(false);
      if (response.status === 400) {
        const code = (error as { error?: string }).error;
        if (code === "DuplicateSku") setErrorKind("duplicateSku");
        else if (code === "InvalidOptionSelection") setErrorKind("invalidOptionSelection");
        else if (code === "UnknownTaxClass") setErrorKind("unknownTaxClass");
        else if (code === "UnknownCategory") setErrorKind("unknownCategory");
        else if (code === "UnknownCollection") setErrorKind("unknownCollection");
        else setErrorKind("generic");
      } else {
        setErrorKind("generic");
      }
      return;
    }

    // The product now exists — skip the image step entirely when nothing
    // was staged (the common case, and today's exact prior behavior).
    if (stagedImages.length === 0) {
      setIsSubmitting(false);
      router.push(`/products/${data.id}`);
      router.refresh();
      return;
    }

    const uploadResults = await Promise.allSettled(
      stagedImages.map((staged) => {
        const formData = new FormData();
        formData.append("file", staged.file);
        return api.POST("/api/v1/admin/products/{id}/images", {
          params: { path: { id: data.id } },
          headers: { "x-csrf-token": readCsrfCookie() },
          body: formData as unknown as { file: string },
        });
      }),
    );

    setIsSubmitting(false);

    // One failed image is never a reason to fail the others — the product
    // is real either way, so every upload is attempted independently and a
    // failure just gets named in the summary below instead of retried.
    const failed = stagedImages
      .filter((_, index) => {
        const result = uploadResults[index];
        return (
          result?.status === "rejected" ||
          (result?.status === "fulfilled" && Boolean(result.value.error))
        );
      })
      .map((staged) => staged.file.name);

    if (failed.length > 0) {
      setCreatedProductId(data.id);
      setFailedImageNames(failed);
      return;
    }

    router.push(`/products/${data.id}`);
    router.refresh();
  }

  // The product already exists at this point — re-rendering the create form
  // would let a duplicate be submitted by mistake, so it's replaced outright
  // rather than merely disabled.
  if (createdProductId && failedImageNames.length > 0) {
    return (
      <div className="mt-8 flex flex-col gap-4">
        <Alert tone="danger">
          {t("imageUploadPartialFailure", {
            failed: failedImageNames.length,
            total: stagedImages.length,
          })}
        </Alert>
        <Text size="sm" tone="muted">
          {failedImageNames.join(", ")}
        </Text>
        <div>
          <Button
            onClick={() => {
              router.push(`/products/${createdProductId}`);
              router.refresh();
            }}
          >
            {t("continueToProductButton")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-10">
      {errorKind ? (
        <Alert tone="danger">
          {errorKind === "duplicateSku"
            ? t("duplicateSkuError")
            : errorKind === "invalidOptionSelection"
              ? t("invalidOptionSelectionError")
              : errorKind === "unknownTaxClass"
                ? t("unknownTaxClassError")
                : errorKind === "unknownCategory"
                  ? t("unknownCategoryError")
                  : errorKind === "unknownCollection"
                    ? t("unknownCollectionError")
                    : t("genericError")}
        </Alert>
      ) : null}

      <section>
        <Heading level={2} className="mb-1">
          {t("section1Heading")}
        </Heading>
        <Text size="sm" tone="muted" className="mb-4">
          {t("section1Hint")}
        </Text>

        <Text size="sm" className="mb-2 font-medium text-neutral-800">
          {t("translationsSwedish")}
        </Text>
        {renderTranslationFields("sv-SE")}

        <div className="mt-6">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowEnglish((current) => !current)}
          >
            {showEnglish ? t("hideEnglishContent") : t("showEnglishContent")}
          </Button>
        </div>
        {showEnglish ? (
          <div className="mt-4">
            <Text size="sm" className="mb-2 font-medium text-neutral-800">
              {t("translationsEnglish")}
            </Text>
            {renderTranslationFields("en")}
          </div>
        ) : null}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <Heading level={2}>{t("optionsHeading")}</Heading>
          <Button type="button" variant="secondary" onClick={addOption}>
            {t("addOption")}
          </Button>
        </div>
        <Text size="sm" tone="muted" className="mt-1">
          {t("optionsHint")}
        </Text>
        <div className="mt-4 flex flex-col gap-4">
          {options.map((option) => (
            <Card key={option.clientId}>
              <div className="flex items-end justify-between gap-4">
                <div className="flex-1">
                  <FormField label={t("optionKeyLabel")}>
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        value={option.key}
                        onChange={(e) => updateOptionKey(option.clientId, e.target.value)}
                        placeholder={t("optionKeyPlaceholder")}
                      />
                    )}
                  </FormField>
                </div>
                <Button type="button" variant="ghost" onClick={() => removeOption(option.clientId)}>
                  {t("removeOption")}
                </Button>
              </div>

              <div className="mt-4 flex flex-col gap-3">
                {option.values.map((value) => (
                  <div
                    key={value.clientId}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
                  >
                    <Input
                      value={value.value}
                      onChange={(e) =>
                        updateOptionValue(option.clientId, value.clientId, "value", e.target.value)
                      }
                      placeholder={t("valueSlugPlaceholder")}
                      aria-label={t("valueSlugPlaceholder")}
                    />
                    <Input
                      value={value.labelSv}
                      onChange={(e) =>
                        updateOptionValue(
                          option.clientId,
                          value.clientId,
                          "labelSv",
                          e.target.value,
                        )
                      }
                      placeholder={t("valueLabelSvPlaceholder")}
                      aria-label={t("valueLabelSvPlaceholder")}
                    />
                    <Input
                      value={value.labelEn}
                      onChange={(e) =>
                        updateOptionValue(
                          option.clientId,
                          value.clientId,
                          "labelEn",
                          e.target.value,
                        )
                      }
                      placeholder={t("valueLabelEnPlaceholder")}
                      aria-label={t("valueLabelEnPlaceholder")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => removeOptionValue(option.clientId, value.clientId)}
                    >
                      {t("removeValue")}
                    </Button>
                  </div>
                ))}
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => addOptionValue(option.clientId)}
                  >
                    {t("addValue")}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <Heading level={2}>{t("variantsHeading")}</Heading>
          <Button type="button" variant="secondary" onClick={addVariant}>
            {t("addVariant")}
          </Button>
        </div>
        <div className="mt-4 flex flex-col gap-4">
          {variants.map((variant, index) => (
            <Card key={variant.clientId}>
              <div className="flex items-center justify-between">
                <Text className="font-medium text-neutral-900">
                  {t("variantN", { n: index + 1 })}
                </Text>
                {variants.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => removeVariant(variant.clientId)}
                  >
                    {t("removeVariant")}
                  </Button>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormField label={t("skuLabel")} hint={t("skuHint")}>
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      placeholder={t("skuPlaceholder")}
                      value={variant.sku}
                      onChange={(e) => updateVariant(variant.clientId, "sku", e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label={t("priceLabel")} required>
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={variant.priceMinor}
                      onChange={(e) =>
                        updateVariant(variant.clientId, "priceMinor", e.target.value)
                      }
                    />
                  )}
                </FormField>
                <FormField
                  label={t("initialStockLabel")}
                  hint={!variant.tracksStock ? t("initialStockDisabledHint") : undefined}
                >
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      type="number"
                      min="0"
                      value={variant.initialStock}
                      onChange={(e) =>
                        updateVariant(variant.clientId, "initialStock", e.target.value)
                      }
                      disabled={!variant.tracksStock}
                    />
                  )}
                </FormField>
                <FormField label={t("taxClassCodeLabel")} required>
                  {(fieldProps) => (
                    <select
                      {...fieldProps}
                      required
                      value={variant.taxClassCode}
                      onChange={(e) =>
                        updateVariant(variant.clientId, "taxClassCode", e.target.value)
                      }
                      className="rounded-sm border border-neutral-300 bg-neutral-50 px-3 py-2 font-sans text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                    >
                      {taxClasses.length === 0 ? (
                        <option value="">{t("noTaxClasses")}</option>
                      ) : null}
                      {taxClasses.map((taxClass) => (
                        <option key={taxClass.id} value={taxClass.code}>
                          {taxClass.name}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>
                <FormField label={t("weightGramsLabel")}>
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      type="number"
                      min="1"
                      placeholder={t("weightGramsPlaceholder")}
                      value={variant.weightGrams}
                      onChange={(e) =>
                        updateVariant(variant.clientId, "weightGrams", e.target.value)
                      }
                    />
                  )}
                </FormField>
                <FormField label={t("productionTimeDaysLabel")}>
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      type="number"
                      min="1"
                      placeholder={t("productionTimeDaysPlaceholder")}
                      value={variant.productionTimeDays}
                      onChange={(e) =>
                        updateVariant(variant.clientId, "productionTimeDays", e.target.value)
                      }
                    />
                  )}
                </FormField>
              </div>

              {options.length > 0 ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {options
                    .filter((o) => o.key.trim() && o.values.length > 0)
                    .map((option) => (
                      <div key={option.clientId} className="flex flex-col gap-1.5">
                        <Text size="sm" className="font-medium text-neutral-800">
                          {option.key}
                        </Text>
                        <select
                          value={variant.selectedOptionValues[option.clientId] ?? ""}
                          onChange={(e) =>
                            updateVariantOptionSelection(
                              variant.clientId,
                              option.clientId,
                              e.target.value,
                            )
                          }
                          className="rounded-sm border border-neutral-300 bg-neutral-50 px-3 py-2 font-sans text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                        >
                          <option value="">{t("selectValue")}</option>
                          {option.values.map((value) => (
                            <option key={value.clientId} value={value.value}>
                              {value.labelSv || value.value}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-neutral-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded-sm border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                    checked={variant.tracksStock}
                    onChange={(e) =>
                      updateVariant(variant.clientId, "tracksStock", e.target.checked)
                    }
                  />
                  {t("tracksStockLabel")}
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded-sm border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                    checked={variant.isLimitedEdition}
                    onChange={(e) =>
                      updateVariant(variant.clientId, "isLimitedEdition", e.target.checked)
                    }
                  />
                  {t("isLimitedEditionLabel")}
                </label>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <Heading level={2} className="mb-1">
          {t("imagesHeading")}
        </Heading>
        <Text size="sm" tone="muted" className="mb-4">
          {t("imagesHint")}
        </Text>

        {rejectedImageNames.length > 0 ? (
          <Alert tone="danger" className="mb-4">
            {t("invalidImageTypeError", { names: rejectedImageNames.join(", ") })}
          </Alert>
        ) : null}

        {stagedImages.length > 0 ? (
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {stagedImages.map((staged) => (
              <div key={staged.clientId} className="flex flex-col gap-2">
                {/* Local object URL preview only — nothing has been
                    uploaded yet, so there is no real image.url to show. */}
                <img
                  src={staged.previewUrl}
                  alt=""
                  className="aspect-square w-full rounded-sm border border-neutral-200 object-cover"
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => removeStagedImage(staged.clientId)}
                >
                  {t("removeImageButton")}
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        <FormField label={t("chooseImagesLabel")}>
          {(fieldProps) => (
            <input
              {...fieldProps}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => {
                handleImagesSelected(e.target.files);
                e.target.value = "";
              }}
              className="rounded-sm border border-neutral-300 text-sm text-neutral-800 file:mr-3 file:rounded-sm file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
          )}
        </FormField>
      </section>

      {categories.length > 0 || collections.length > 0 ? (
        <section>
          <Heading level={2} className="mb-4">
            {t("categoriesCollectionsHeading")}
          </Heading>
          <div className="grid gap-8 sm:grid-cols-2">
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
          </div>
        </section>
      ) : null}

      <div className="flex justify-end">
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
  );
}
