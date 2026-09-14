"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert, Button, Card, FormField, Input, Textarea, Spinner, Text } from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";

export interface HomepageSectionContent {
  eyebrowSv: string | null;
  eyebrowEn: string | null;
  titleSv: string | null;
  titleEn: string | null;
  descriptionSv: string | null;
  descriptionEn: string | null;
  ctaLabelSv: string | null;
  ctaLabelEn: string | null;
  ctaHref: string | null;
}

export interface HomepageSectionContentFormProps {
  slug: "hero" | "story" | "made-to-order" | "announcement";
  label: string;
  content: HomepageSectionContent;
  canManage: boolean;
  // Which fields this section actually uses — see schema.prisma's own
  // HomepageSection comment for why each shape leaves the rest null:
  // "message" (announcement — one line, titleSv/En only), "heading" (hero —
  // title only, no description/eyebrow/CTA/image — the storefront hero no
  // longer renders a description under the title), "full" (story/made-to-
  // order — everything, alongside the separate HomepageSectionImageForm).
  variant: "message" | "heading" | "full";
}

type FormState = Record<keyof HomepageSectionContent, string>;

function toFormState(content: HomepageSectionContent): FormState {
  return {
    eyebrowSv: content.eyebrowSv ?? "",
    eyebrowEn: content.eyebrowEn ?? "",
    titleSv: content.titleSv ?? "",
    titleEn: content.titleEn ?? "",
    descriptionSv: content.descriptionSv ?? "",
    descriptionEn: content.descriptionEn ?? "",
    ctaLabelSv: content.ctaLabelSv ?? "",
    ctaLabelEn: content.ctaLabelEn ?? "",
    ctaHref: content.ctaHref ?? "",
  };
}

// A blank field here means "use the storefront's own built-in default copy"
// (Home.storyTitle etc. in apps/storefront's messages) — this form never
// shows that fallback text as a placeholder value, since typing over a
// placeholder and submitting an unrelated blank would silently commit an
// empty string; an actually-empty field submits as "" (clears to null on
// the server), which is exactly the "revert to default" action.
export function HomepageSectionContentForm({
  slug,
  label,
  content,
  canManage,
  variant,
}: HomepageSectionContentFormProps) {
  const t = useTranslations("Content.homepageContent");
  const hasEyebrowAndCta = variant === "full";
  const hasDescription = variant === "full";
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toFormState(content));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  function update(field: keyof FormState, value: string) {
    setJustSaved(false);
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setHasError(false);
    setIsSubmitting(true);

    try {
      const { error } = await api.PATCH("/api/v1/admin/homepage-sections/{key}", {
        params: { path: { key: slug } },
        headers: { "x-csrf-token": readCsrfCookie() },
        body: form,
      });

      if (error) {
        setHasError(true);
        return;
      }

      setJustSaved(true);
      router.refresh();
    } catch {
      setHasError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Text className="font-medium text-neutral-900">{label}</Text>

        {hasError ? <Alert tone="danger">{t("genericError")}</Alert> : null}

        {hasEyebrowAndCta ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t("eyebrowSvLabel")}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  value={form.eyebrowSv}
                  disabled={!canManage}
                  onChange={(e) => update("eyebrowSv", e.target.value)}
                />
              )}
            </FormField>
            <FormField label={t("eyebrowEnLabel")}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  value={form.eyebrowEn}
                  disabled={!canManage}
                  onChange={(e) => update("eyebrowEn", e.target.value)}
                />
              )}
            </FormField>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={variant === "message" ? t("messageSvLabel") : t("titleSvLabel")}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                value={form.titleSv}
                disabled={!canManage}
                onChange={(e) => update("titleSv", e.target.value)}
              />
            )}
          </FormField>
          <FormField label={variant === "message" ? t("messageEnLabel") : t("titleEnLabel")}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                value={form.titleEn}
                disabled={!canManage}
                onChange={(e) => update("titleEn", e.target.value)}
              />
            )}
          </FormField>
        </div>

        {hasDescription ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t("descriptionSvLabel")}>
              {(fieldProps) => (
                <Textarea
                  {...fieldProps}
                  rows={3}
                  value={form.descriptionSv}
                  disabled={!canManage}
                  onChange={(e) => update("descriptionSv", e.target.value)}
                />
              )}
            </FormField>
            <FormField label={t("descriptionEnLabel")}>
              {(fieldProps) => (
                <Textarea
                  {...fieldProps}
                  rows={3}
                  value={form.descriptionEn}
                  disabled={!canManage}
                  onChange={(e) => update("descriptionEn", e.target.value)}
                />
              )}
            </FormField>
          </div>
        ) : null}

        {hasEyebrowAndCta ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("ctaLabelSvLabel")}>
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    value={form.ctaLabelSv}
                    disabled={!canManage}
                    onChange={(e) => update("ctaLabelSv", e.target.value)}
                  />
                )}
              </FormField>
              <FormField label={t("ctaLabelEnLabel")}>
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    value={form.ctaLabelEn}
                    disabled={!canManage}
                    onChange={(e) => update("ctaLabelEn", e.target.value)}
                  />
                )}
              </FormField>
            </div>
            <FormField label={t("ctaHrefLabel")} hint={t("ctaHrefHint")}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  value={form.ctaHref}
                  disabled={!canManage}
                  onChange={(e) => update("ctaHref", e.target.value)}
                />
              )}
            </FormField>
          </>
        ) : null}

        {canManage ? (
          <div className="flex items-center gap-3">
            <Button type="submit" variant="secondary" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Spinner className="h-4 w-4" /> {t("saving")}
                </>
              ) : (
                t("saveButton")
              )}
            </Button>
            {justSaved ? (
              <Text size="sm" tone="muted">
                {t("savedNotice")}
              </Text>
            ) : null}
          </div>
        ) : null}
      </form>
    </Card>
  );
}
