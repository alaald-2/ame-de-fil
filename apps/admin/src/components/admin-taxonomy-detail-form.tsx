"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Heading,
  Text,
  Button,
  Alert,
  Dialog,
  DialogTrigger,
  DialogContent,
  FormField,
  Input,
  Textarea,
  Spinner,
} from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";
import { TAXONOMY_CONTENT_PLACEHOLDERS } from "../lib/taxonomy-content-placeholders";

interface TranslationDraft {
  name: string;
  slug: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
}

export interface AdminTaxonomyTranslationData {
  locale: "sv-SE" | "en";
  name: string;
  slug: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

interface AdminTaxonomyDetailFormProps {
  kind: "categories" | "collections";
  id: string;
  translations: AdminTaxonomyTranslationData[];
  productCount: number;
  listBasePath: "/content" | "/content/collections";
}

function toDraft(t?: AdminTaxonomyTranslationData): TranslationDraft {
  return {
    name: t?.name ?? "",
    slug: t?.slug ?? "",
    description: t?.description ?? "",
    metaTitle: t?.metaTitle ?? "",
    metaDescription: t?.metaDescription ?? "",
  };
}

type SaveErrorKind = "duplicateSlug" | "generic" | null;

// Shared by /content/[id] (category) and /content/collections/[id]
// (collection) — see admin-taxonomy-table.tsx's own comment for why
// Category/Collection share one parameterized component. Two independent
// actions: saving translations (upsert-per-locale, same semantics as
// Products' own detail form) and deleting (blocked client-side, mirroring
// user-role-manager.tsx's "can't remove a user's last role" pattern,
// whenever productCount > 0 — a doomed request never round-trips to the
// server just to learn what the count already tells us here).
export function AdminTaxonomyDetailForm({ kind, id, translations, productCount, listBasePath }: AdminTaxonomyDetailFormProps) {
  const t = useTranslations(`Content.${kind}.detail`);
  const router = useRouter();

  const [drafts, setDrafts] = useState<Record<"sv-SE" | "en", TranslationDraft>>({
    "sv-SE": toDraft(translations.find((tr) => tr.locale === "sv-SE")),
    en: toDraft(translations.find((tr) => tr.locale === "en")),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveErrorKind, setSaveErrorKind] = useState<SaveErrorKind>(null);
  const [saved, setSaved] = useState(false);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  function updateField(locale: "sv-SE" | "en", field: keyof TranslationDraft, value: string) {
    setSaved(false);
    setDrafts((current) => ({ ...current, [locale]: { ...current[locale], [field]: value } }));
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaveErrorKind(null);
    setSaved(false);
    setIsSubmitting(true);

    const translationsBody = (["sv-SE", "en"] as const)
      .filter((locale) => drafts[locale].name.trim() && drafts[locale].slug.trim())
      .map((locale) => ({
        locale,
        name: drafts[locale].name,
        slug: drafts[locale].slug,
        description: drafts[locale].description || undefined,
        metaTitle: drafts[locale].metaTitle || undefined,
        metaDescription: drafts[locale].metaDescription || undefined,
      }));

    const { error } =
      kind === "categories"
        ? await api.PATCH("/api/v1/admin/categories/{id}", {
            params: { path: { id } },
            headers: { "x-csrf-token": readCsrfCookie() },
            body: { translations: translationsBody },
          })
        : await api.PATCH("/api/v1/admin/collections/{id}", {
            params: { path: { id } },
            headers: { "x-csrf-token": readCsrfCookie() },
            body: { translations: translationsBody },
          });

    setIsSubmitting(false);

    if (error) {
      const code = (error as { error?: string }).error;
      setSaveErrorKind(code === "DuplicateSlug" ? "duplicateSlug" : "generic");
      return;
    }

    setSaved(true);
    router.refresh();
  }

  async function handleDelete() {
    setDeleteFailed(false);
    setIsDeleting(true);

    const { error } =
      kind === "categories"
        ? await api.DELETE("/api/v1/admin/categories/{id}", {
            params: { path: { id } },
            headers: { "x-csrf-token": readCsrfCookie() },
          })
        : await api.DELETE("/api/v1/admin/collections/{id}", {
            params: { path: { id } },
            headers: { "x-csrf-token": readCsrfCookie() },
          });

    setIsDeleting(false);

    if (error) {
      setDeleteFailed(true);
      return;
    }

    router.push(listBasePath);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-10">
      <form onSubmit={handleSave} className="flex flex-col gap-8">
        {saveErrorKind ? (
          <Alert tone="danger">{saveErrorKind === "duplicateSlug" ? t("duplicateSlugError") : t("genericError")}</Alert>
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
                    placeholder={TAXONOMY_CONTENT_PLACEHOLDERS[kind][locale].name}
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
                    placeholder={TAXONOMY_CONTENT_PLACEHOLDERS[kind][locale].description}
                    value={drafts[locale].description}
                    onChange={(e) => updateField(locale, "description", e.target.value)}
                  />
                )}
              </FormField>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
          </section>
        ))}

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

      <section className="border-t border-neutral-200 pt-6">
        <Text size="sm" tone="muted">
          {t("productCount", { count: productCount })}
        </Text>
        {deleteFailed ? (
          <Alert tone="danger" className="mt-3">
            {t("deleteError")}
          </Alert>
        ) : null}
        {productCount > 0 ? (
          <>
            <div className="mt-3">
              <Button type="button" variant="secondary" disabled title={t("deleteBlockedNotice", { count: productCount })}>
                {t("deleteAction")}
              </Button>
            </div>
            <Text size="sm" tone="muted" className="mt-1.5">
              {t("deleteBlockedNotice", { count: productCount })}
            </Text>
          </>
        ) : (
          <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="secondary" className="mt-3">
                {t("deleteAction")}
              </Button>
            </DialogTrigger>
            <DialogContent title={t("deleteConfirmTitle")} description={t("deleteConfirmDescription")} closeLabel={t("close")}>
              <div className="flex justify-end gap-3">
                <Button type="button" onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? (
                    <>
                      <Spinner className="h-4 w-4" /> {t("deleteAction")}
                    </>
                  ) : (
                    t("deleteAction")
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </section>
    </div>
  );
}
