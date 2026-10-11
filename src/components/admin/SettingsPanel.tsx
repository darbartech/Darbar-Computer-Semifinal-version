"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/common/Badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { ImagePicker, type LibraryImage, type PickedImage } from "@/components/admin/ImagePicker";
import { saveSetting } from "@/server/actions/settings";
import type { SiteSettingsView } from "@/lib/settings-view";
import {
  SETTINGS_TABS,
  SOCIAL_ICON_OPTIONS,
  WHY_ICON_OPTIONS,
  isPlaceholderText,
  type AboutSettings,
  type ContactSettings,
  type GeneralSettings,
  type HeroSettings,
  type HoursSettings,
  type SettingsKey,
  type SocialsSettings,
  type StatsSettings,
  type WhyChooseUsSettings,
} from "@/lib/validators/settings";

/**
 * Site settings editor (docs/05 §4.13).
 *
 * One tab per `SiteSetting.key`, one save per tab: the tab sends `{ key, value }`
 * to `saveSetting`, the action validates it with the key's Zod schema, writes the
 * row, audits it and invalidates the `settings` tag.
 *
 * Arrays are edited as rows (hours, socials, stats, why choose us); the two plain
 * string lists are edited as one-item-per-line textareas that the schema splits.
 */

/** Image id plus the picked image, so the tab can re-hydrate `ImagePicker`. */
type GeneralDraft = Omit<GeneralSettings, "logoMediaId"> & {
  logoMediaId: string;
  logo: PickedImage | null;
};

type AboutDraft = Omit<AboutSettings, "campusMediaId"> & {
  campusMediaId: string;
  campus: PickedImage | null;
};

type HeroDraft = Omit<HeroSettings, "imageMediaId" | "popupMediaId"> & {
  imageMediaId: string;
  image: PickedImage | null;
  popupMediaId: string;
  popup: PickedImage | null;
};

type Draft = {
  general: GeneralDraft;
  hero: HeroDraft;
  contact: ContactSettings;
  hours: HoursSettings;
  socials: SocialsSettings;
  about: AboutDraft;
  stats: StatsSettings;
  whyChooseUs: WhyChooseUsSettings;
  /** Textarea form; `facilitiesSchema` / `everyCourseIncludesSchema` split it. */
  facilities: string;
  everyCourseIncludes: string;
};

type Props = {
  settings: SiteSettingsView;
  /** Last write time per key, shown as "last saved" on the tab. */
  updatedAtByKey: Record<string, string>;
  library: LibraryImage[];
  canWrite: boolean;
};

function buildDraft(settings: SiteSettingsView): Draft {
  const { general, hero, contact, about } = settings;
  return {
    general: {
      name: general.name,
      shortName: general.shortName,
      tagline: general.tagline,
      description: general.description,
      siteUrl: general.siteUrl,
      twitterHandle: general.twitterHandle,
      logoMediaId: general.logoMediaId ?? "",
      logo: general.logoMediaId
        ? { id: general.logoMediaId, url: general.logoUrl ?? "", alt: general.name }
        : null,
    },
    hero: {
      eyebrow: hero.eyebrow,
      title: hero.title,
      subtitle: hero.subtitle,
      primaryCtaLabel: hero.primaryCtaLabel,
      primaryCtaHref: hero.primaryCtaHref,
      secondaryCtaLabel: hero.secondaryCtaLabel,
      secondaryCtaHref: hero.secondaryCtaHref,
      imageAlt: hero.imageAlt,
      popupAlt: hero.popupAlt,
      imageMediaId: hero.imageMediaId ?? "",
      image: hero.imageMediaId
        ? { id: hero.imageMediaId, url: hero.imageUrl, alt: hero.imageAlt }
        : null,
      popupMediaId: hero.popupMediaId ?? "",
      popup: hero.popupMediaId
        ? { id: hero.popupMediaId, url: hero.popupImageUrl, alt: hero.popupAlt }
        : null,
    },
    contact: { ...contact },
    hours: settings.hours.map((row) => ({ ...row })),
    socials: settings.socials.map((row) => ({ ...row })),
    about: {
      story: about.story,
      mission: about.mission,
      vision: about.vision,
      campusMediaId: about.campusMediaId ?? "",
      campus: about.campusMediaId
        ? { id: about.campusMediaId, url: about.campusImageUrl, alt: `${general.name} campus` }
        : null,
    },
    stats: settings.stats.map((row) => ({ ...row })),
    whyChooseUs: settings.whyChooseUs.map((row) => ({ ...row })),
    facilities: settings.facilities.join("\n"),
    everyCourseIncludes: settings.everyCourseIncludes.join("\n"),
  };
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-neutral-500">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function RowShell({
  title,
  onRemove,
  canRemove,
  children,
}: {
  title: string;
  onRemove: () => void;
  canRemove: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {title}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={!canRemove}
          className="text-neutral-500 hover:text-red-600"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Remove
        </Button>
      </div>
      {children}
    </div>
  );
}

export function SettingsPanel({ settings, updatedAtByKey, library, canWrite }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [draft, setDraft] = React.useState<Draft>(() => buildDraft(settings));
  const [syncedSettings, setSyncedSettings] = React.useState(settings);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = React.useState<SettingsKey | null>(null);

  /**
   * Reset the draft when `router.refresh()` hands down new server values. Done
   * during render (the documented "adjust state when a prop changes" pattern)
   * rather than in an effect, so a save never re-renders with a stale draft.
   */
  if (syncedSettings !== settings) {
    setSyncedSettings(settings);
    setDraft(buildDraft(settings));
  }

  const errorFor = (key: string) => fieldErrors[key];

  async function save(key: SettingsKey) {
    setSavingKey(key);
    setFieldErrors({});
    try {
      const result = await saveSetting({ key, value: draft[key] });
      if (!result.ok) {
        const next: Record<string, string> = {};
        for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
          if (messages?.[0]) next[field] = messages[0];
        }
        setFieldErrors(next);
        toast({ title: result.error, variant: "error" });
        return;
      }
      toast({
        title: "Settings saved",
        description: "The public site updates on the next visit.",
        variant: "success",
      });
      router.refresh();
    } finally {
      setSavingKey(null);
    }
  }

  const busy = (key: SettingsKey) => savingKey === key;

  const saveButton = (key: SettingsKey) => {
    const savedAt = updatedAtByKey[key];
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-neutral-500">
          {savedAt
            ? `Last saved ${new Date(savedAt).toLocaleString("en-GB")}`
            : "Using the built-in fallback — save to store this group in the database."}
        </p>
        <Button type="button" onClick={() => save(key)} disabled={!canWrite || busy(key)}>
          {busy(key) ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="size-4" aria-hidden="true" />
          )}
          Save
        </Button>
      </div>
    );
  };

  return (
    <Tabs defaultValue="general" className="gap-5">
      <TabsList className="flex flex-wrap gap-1.5">
        {SETTINGS_TABS.map((tab) => (
          <TabsTrigger key={tab.key} value={tab.key}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {!canWrite && (
        <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          You can read these settings but not change them.
        </p>
      )}

      {/* ── General (identity + SEO defaults) ── */}
      <TabsContent value="general">
        <Card>
          <CardContent className="flex flex-col gap-5 p-6">
            <p className="text-sm text-neutral-600">
              Name, tagline and description feed the header, the footer and every page
              title. Site URL and the Twitter handle are the SEO defaults.
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Site name" htmlFor="general-name" error={errorFor("name")}>
                <Input
                  id="general-name"
                  value={draft.general.name}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, general: { ...d.general, name: e.target.value } }))
                  }
                />
              </Field>
              <Field label="Short name" htmlFor="general-short-name" error={errorFor("shortName")}>
                <Input
                  id="general-short-name"
                  value={draft.general.shortName}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, general: { ...d.general, shortName: e.target.value } }))
                  }
                />
              </Field>
            </div>
            <Field label="Tagline" htmlFor="general-tagline" error={errorFor("tagline")}>
              <Input
                id="general-tagline"
                value={draft.general.tagline}
                disabled={!canWrite}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, general: { ...d.general, tagline: e.target.value } }))
                }
              />
            </Field>
            <Field
              label="Site description"
              htmlFor="general-description"
              hint="Used as the default meta description and Open Graph description."
              error={errorFor("description")}
            >
              <Textarea
                id="general-description"
                rows={3}
                value={draft.general.description}
                disabled={!canWrite}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, general: { ...d.general, description: e.target.value } }))
                }
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Site URL"
                htmlFor="general-site-url"
                hint="Canonical domain — also the sitemap base URL."
                error={errorFor("siteUrl")}
              >
                <Input
                  id="general-site-url"
                  inputMode="url"
                  value={draft.general.siteUrl}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, general: { ...d.general, siteUrl: e.target.value } }))
                  }
                />
              </Field>
              <Field label="Twitter handle" htmlFor="general-twitter" error={errorFor("twitterHandle")}>
                <Input
                  id="general-twitter"
                  placeholder="@darbarcomputer"
                  value={draft.general.twitterHandle}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, general: { ...d.general, twitterHandle: e.target.value } }))
                  }
                />
              </Field>
            </div>
            <ImagePicker
              label="Logo"
              hint="Shown in the Open Graph card. Leave empty to use the generated social image."
              value={draft.general.logo}
              library={library}
              disabled={!canWrite}
              onChange={(value) =>
                setDraft((d) => ({
                  ...d,
                  general: { ...d.general, logo: value, logoMediaId: value?.id ?? "" },
                }))
              }
            />
            {saveButton("general")}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Hero (home page banner) ── */}
      <TabsContent value="hero">
        <Card>
          <CardContent className="flex flex-col gap-5 p-6">
            <p className="text-sm text-neutral-600">
              The home page banner. In the eyebrow and heading, wrap a phrase in
              <code className="mx-1 rounded bg-neutral-100 px-1.5 py-0.5 text-xs">**doubled
              asterisks**</code>
              to highlight it, and press Enter for a line break in the heading.
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Eyebrow" htmlFor="hero-eyebrow" error={errorFor("eyebrow")}>
                <Input
                  id="hero-eyebrow"
                  value={draft.hero.eyebrow}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, hero: { ...d.hero, eyebrow: e.target.value } }))
                  }
                />
              </Field>
              <Field
                label="Heading"
                htmlFor="hero-title"
                hint="Enter starts a new line; **phrase** is highlighted."
                error={errorFor("title")}
              >
                <Textarea
                  id="hero-title"
                  rows={3}
                  value={draft.hero.title}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, hero: { ...d.hero, title: e.target.value } }))
                  }
                />
              </Field>
            </div>
            <Field label="Subtitle" htmlFor="hero-subtitle" error={errorFor("subtitle")}>
              <Textarea
                id="hero-subtitle"
                rows={3}
                value={draft.hero.subtitle}
                disabled={!canWrite}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, hero: { ...d.hero, subtitle: e.target.value } }))
                }
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Primary button label" htmlFor="hero-primary-label" error={errorFor("primaryCtaLabel")}>
                <Input
                  id="hero-primary-label"
                  value={draft.hero.primaryCtaLabel}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, hero: { ...d.hero, primaryCtaLabel: e.target.value } }))
                  }
                />
              </Field>
              <Field
                label="Primary button link"
                htmlFor="hero-primary-href"
                hint="A site path like /courses or an https URL."
                error={errorFor("primaryCtaHref")}
              >
                <Input
                  id="hero-primary-href"
                  value={draft.hero.primaryCtaHref}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, hero: { ...d.hero, primaryCtaHref: e.target.value } }))
                  }
                />
              </Field>
              <Field
                label="Secondary button label"
                htmlFor="hero-secondary-label"
                hint="Optional. Leave both secondary fields empty to hide the second button."
                error={errorFor("secondaryCtaLabel")}
              >
                <Input
                  id="hero-secondary-label"
                  value={draft.hero.secondaryCtaLabel}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, hero: { ...d.hero, secondaryCtaLabel: e.target.value } }))
                  }
                />
              </Field>
              <Field
                label="Secondary button link"
                htmlFor="hero-secondary-href"
                error={errorFor("secondaryCtaHref")}
              >
                <Input
                  id="hero-secondary-href"
                  value={draft.hero.secondaryCtaHref}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, hero: { ...d.hero, secondaryCtaHref: e.target.value } }))
                  }
                />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-5">
                <ImagePicker
                  label="Hero image"
                  hint="Leave empty to use the built-in hero artwork."
                  value={draft.hero.image}
                  library={library}
                  disabled={!canWrite}
                  onChange={(value) =>
                    setDraft((d) => ({
                      ...d,
                      hero: { ...d.hero, image: value, imageMediaId: value?.id ?? "" },
                    }))
                  }
                />
                <Field label="Hero image alt text" htmlFor="hero-image-alt" error={errorFor("imageAlt")}>
                  <Input
                    id="hero-image-alt"
                    value={draft.hero.imageAlt}
                    disabled={!canWrite}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, hero: { ...d.hero, imageAlt: e.target.value } }))
                    }
                  />
                </Field>
              </div>
              <div className="flex flex-col gap-5">
                <ImagePicker
                  label="Pop-up image"
                  hint="The small floating image. Leave empty to use the built-in artwork."
                  value={draft.hero.popup}
                  library={library}
                  disabled={!canWrite}
                  onChange={(value) =>
                    setDraft((d) => ({
                      ...d,
                      hero: { ...d.hero, popup: value, popupMediaId: value?.id ?? "" },
                    }))
                  }
                />
                <Field label="Pop-up image alt text" htmlFor="hero-popup-alt" error={errorFor("popupAlt")}>
                  <Input
                    id="hero-popup-alt"
                    value={draft.hero.popupAlt}
                    disabled={!canWrite}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, hero: { ...d.hero, popupAlt: e.target.value } }))
                    }
                  />
                </Field>
              </div>
            </div>
            {saveButton("hero")}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Contact ── */}
      <TabsContent value="contact">
        <Card>
          <CardContent className="flex flex-col gap-5 p-6">
            <p className="text-sm text-neutral-600">
              Shown in the header, footer, contact page, WhatsApp button and the
              organization JSON-LD.
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Phone" htmlFor="contact-phone" error={errorFor("phone")}>
                <Input
                  id="contact-phone"
                  value={draft.contact.phone}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, contact: { ...d.contact, phone: e.target.value } }))
                  }
                />
              </Field>
              <Field label="WhatsApp" htmlFor="contact-whatsapp" error={errorFor("whatsapp")}>
                <Input
                  id="contact-whatsapp"
                  value={draft.contact.whatsapp}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, contact: { ...d.contact, whatsapp: e.target.value } }))
                  }
                />
              </Field>
              <Field label="Email" htmlFor="contact-email" error={errorFor("email")}>
                <Input
                  id="contact-email"
                  type="email"
                  value={draft.contact.email}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, contact: { ...d.contact, email: e.target.value } }))
                  }
                />
              </Field>
              <Field
                label="Notification e-mail"
                htmlFor="contact-notify"
                hint="Where form notifications go. Optional."
                error={errorFor("notifyEmail")}
              >
                <Input
                  id="contact-notify"
                  type="email"
                  value={draft.contact.notifyEmail}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, contact: { ...d.contact, notifyEmail: e.target.value } }))
                  }
                />
              </Field>
            </div>
            <Field label="Address" htmlFor="contact-address" error={errorFor("address")}>
              <Textarea
                id="contact-address"
                rows={2}
                value={draft.contact.address}
                disabled={!canWrite}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, contact: { ...d.contact, address: e.target.value } }))
                }
              />
            </Field>
            <Field
              label="Map location"
              htmlFor="contact-map"
              hint="A place query such as “Kathmandu, Nepal” — the map embed URL is built from it."
              error={errorFor("mapQuery")}
            >
              <Input
                id="contact-map"
                value={draft.contact.mapQuery}
                disabled={!canWrite}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, contact: { ...d.contact, mapQuery: e.target.value } }))
                }
              />
            </Field>
            {saveButton("contact")}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Opening hours ── */}
      <TabsContent value="hours">
        <Card>
          <CardContent className="flex flex-col gap-5 p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-neutral-600">
                One row per day or day range, in the order they should appear.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canWrite}
                onClick={() =>
                  setDraft((d) => ({ ...d, hours: [...d.hours, { day: "", time: "" }] }))
                }
              >
                <Plus className="size-4" aria-hidden="true" />
                Add row
              </Button>
            </div>
            {draft.hours.map((row, index) => (
              <RowShell
                key={index}
                title={`Row ${index + 1}`}
                canRemove={draft.hours.length > 1 && canWrite}
                onRemove={() =>
                  setDraft((d) => ({ ...d, hours: d.hours.filter((_, i) => i !== index) }))
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Day" htmlFor={`hours-day-${index}`} error={errorFor(`hours.${index}.day`)}>
                    <Input
                      id={`hours-day-${index}`}
                      placeholder="Sunday – Friday"
                      value={row.day}
                      disabled={!canWrite}
                      onChange={(e) =>
                        setDraft((d) => {
                          const rows = [...d.hours];
                          rows[index] = { ...rows[index], day: e.target.value };
                          return { ...d, hours: rows };
                        })
                      }
                    />
                  </Field>
                  <Field label="Hours" htmlFor={`hours-time-${index}`} error={errorFor(`hours.${index}.time`)}>
                    <Input
                      id={`hours-time-${index}`}
                      placeholder="7:00 AM – 8:00 PM"
                      value={row.time}
                      disabled={!canWrite}
                      onChange={(e) =>
                        setDraft((d) => {
                          const rows = [...d.hours];
                          rows[index] = { ...rows[index], time: e.target.value };
                          return { ...d, hours: rows };
                        })
                      }
                    />
                  </Field>
                </div>
              </RowShell>
            ))}
            {saveButton("hours")}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Social links ── */}
      <TabsContent value="socials">
        <Card>
          <CardContent className="flex flex-col gap-5 p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-neutral-600">
                Rendered in the footer and on the contact page.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canWrite}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    socials: [...d.socials, { name: "", url: "https://", icon: "facebook" }],
                  }))
                }
              >
                <Plus className="size-4" aria-hidden="true" />
                Add link
              </Button>
            </div>
            {draft.socials.map((row, index) => (
              <RowShell
                key={index}
                title={`Link ${index + 1}`}
                canRemove={draft.socials.length > 1 && canWrite}
                onRemove={() =>
                  setDraft((d) => ({ ...d, socials: d.socials.filter((_, i) => i !== index) }))
                }
              >
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Network" htmlFor={`socials-name-${index}`} error={errorFor(`socials.${index}.name`)}>
                    <Input
                      id={`socials-name-${index}`}
                      value={row.name}
                      disabled={!canWrite}
                      onChange={(e) =>
                        setDraft((d) => {
                          const rows = [...d.socials];
                          rows[index] = { ...rows[index], name: e.target.value };
                          return { ...d, socials: rows };
                        })
                      }
                    />
                  </Field>
                  <Field label="URL" htmlFor={`socials-url-${index}`} error={errorFor(`socials.${index}.url`)}>
                    <Input
                      id={`socials-url-${index}`}
                      value={row.url}
                      disabled={!canWrite}
                      onChange={(e) =>
                        setDraft((d) => {
                          const rows = [...d.socials];
                          rows[index] = { ...rows[index], url: e.target.value };
                          return { ...d, socials: rows };
                        })
                      }
                    />
                  </Field>
                  <Field label="Icon" htmlFor={`socials-icon-${index}`} error={errorFor(`socials.${index}.icon`)}>
                    <Select
                      id={`socials-icon-${index}`}
                      options={SOCIAL_ICON_OPTIONS}
                      value={row.icon}
                      disabled={!canWrite}
                      onChange={(e) =>
                        setDraft((d) => {
                          const rows = [...d.socials];
                          rows[index] = { ...rows[index], icon: e.target.value as SocialsSettings[number]["icon"] };
                          return { ...d, socials: rows };
                        })
                      }
                    />
                  </Field>
                </div>
              </RowShell>
            ))}
            {saveButton("socials")}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── About ── */}
      <TabsContent value="about">
        <Card>
          <CardContent className="flex flex-col gap-5 p-6">
            <Field label="Story" htmlFor="about-story" error={errorFor("story")}>
              <Textarea
                id="about-story"
                rows={6}
                value={draft.about.story}
                disabled={!canWrite}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, about: { ...d.about, story: e.target.value } }))
                }
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Mission" htmlFor="about-mission" error={errorFor("mission")}>
                <Textarea
                  id="about-mission"
                  rows={5}
                  value={draft.about.mission}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, about: { ...d.about, mission: e.target.value } }))
                  }
                />
              </Field>
              <Field label="Vision" htmlFor="about-vision" error={errorFor("vision")}>
                <Textarea
                  id="about-vision"
                  rows={5}
                  value={draft.about.vision}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, about: { ...d.about, vision: e.target.value } }))
                  }
                />
              </Field>
            </div>
            <ImagePicker
              label="Campus photo"
              hint="Recommended 1400 x 933. Leave empty to use the stock campus photo."
              value={draft.about.campus}
              library={library}
              disabled={!canWrite}
              onChange={(value) =>
                setDraft((d) => ({
                  ...d,
                  about: { ...d.about, campus: value, campusMediaId: value?.id ?? "" },
                }))
              }
            />
            {saveButton("about")}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Stats ── */}
      <TabsContent value="stats">
        <Card>
          <CardContent className="flex flex-col gap-5 p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-neutral-600">
                Figures that are still guesses must stay marked unverified — the
                public pages print a marker next to them.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canWrite}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    stats: [...d.stats, { label: "", value: "", isPlaceholder: false }],
                  }))
                }
              >
                <Plus className="size-4" aria-hidden="true" />
                Add stat
              </Button>
            </div>
            {draft.stats.map((row, index) => {
              const looksLikePlaceholder = !row.isPlaceholder && isPlaceholderText(row.value);
              return (
                <RowShell
                  key={index}
                  title={`Stat ${index + 1}`}
                  canRemove={draft.stats.length > 1 && canWrite}
                  onRemove={() =>
                    setDraft((d) => ({ ...d, stats: d.stats.filter((_, i) => i !== index) }))
                  }
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Label" htmlFor={`stats-label-${index}`} error={errorFor(`stats.${index}.label`)}>
                      <Input
                        id={`stats-label-${index}`}
                        value={row.label}
                        disabled={!canWrite}
                        onChange={(e) =>
                          setDraft((d) => {
                            const rows = [...d.stats];
                            rows[index] = { ...rows[index], label: e.target.value };
                            return { ...d, stats: rows };
                          })
                        }
                      />
                    </Field>
                    <Field
                      label="Value"
                      htmlFor={`stats-value-${index}`}
                      error={errorFor(`stats.${index}.value`)}
                    >
                      <Input
                        id={`stats-value-${index}`}
                        value={row.value}
                        disabled={!canWrite}
                        onChange={(e) =>
                          setDraft((d) => {
                            const rows = [...d.stats];
                            rows[index] = { ...rows[index], value: e.target.value };
                            return { ...d, stats: rows };
                          })
                        }
                      />
                    </Field>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id={`stats-placeholder-${index}`}
                      type="checkbox"
                      className="size-4 rounded border-neutral-300"
                      checked={row.isPlaceholder}
                      disabled={!canWrite}
                      onChange={(e) =>
                        setDraft((d) => {
                          const rows = [...d.stats];
                          rows[index] = { ...rows[index], isPlaceholder: e.target.checked };
                          return { ...d, stats: rows };
                        })
                      }
                    />
                    <Label htmlFor={`stats-placeholder-${index}`} className="font-normal text-sm text-neutral-700">
                      Not verified yet
                    </Label>
                    {row.isPlaceholder && <Badge variant="outline">unverified</Badge>}
                  </div>
                  {looksLikePlaceholder && (
                    <p className="text-xs font-medium text-amber-700">
                      This value still reads as a placeholder. Tick “Not verified yet”
                      or enter the confirmed figure.
                    </p>
                  )}
                </RowShell>
              );
            })}
            {saveButton("stats")}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Why choose us ── */}
      <TabsContent value="whyChooseUs">
        <Card>
          <CardContent className="flex flex-col gap-5 p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-neutral-600">
                Highlight cards on the home page, in this order.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canWrite}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    whyChooseUs: [...d.whyChooseUs, { title: "", description: "", icon: "award" }],
                  }))
                }
              >
                <Plus className="size-4" aria-hidden="true" />
                Add highlight
              </Button>
            </div>
            {draft.whyChooseUs.map((row, index) => (
              <RowShell
                key={index}
                title={`Highlight ${index + 1}`}
                canRemove={draft.whyChooseUs.length > 1 && canWrite}
                onRemove={() =>
                  setDraft((d) => ({ ...d, whyChooseUs: d.whyChooseUs.filter((_, i) => i !== index) }))
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Title" htmlFor={`why-title-${index}`} error={errorFor(`whyChooseUs.${index}.title`)}>
                    <Input
                      id={`why-title-${index}`}
                      value={row.title}
                      disabled={!canWrite}
                      onChange={(e) =>
                        setDraft((d) => {
                          const rows = [...d.whyChooseUs];
                          rows[index] = { ...rows[index], title: e.target.value };
                          return { ...d, whyChooseUs: rows };
                        })
                      }
                    />
                  </Field>
                  <Field label="Icon" htmlFor={`why-icon-${index}`} error={errorFor(`whyChooseUs.${index}.icon`)}>
                    <Select
                      id={`why-icon-${index}`}
                      options={WHY_ICON_OPTIONS}
                      value={row.icon}
                      disabled={!canWrite}
                      onChange={(e) =>
                        setDraft((d) => {
                          const rows = [...d.whyChooseUs];
                          rows[index] = {
                            ...rows[index],
                            icon: e.target.value as WhyChooseUsSettings[number]["icon"],
                          };
                          return { ...d, whyChooseUs: rows };
                        })
                      }
                    />
                  </Field>
                </div>
                <Field
                  label="Description"
                  htmlFor={`why-description-${index}`}
                  error={errorFor(`whyChooseUs.${index}.description`)}
                >
                  <Textarea
                    id={`why-description-${index}`}
                    rows={3}
                    value={row.description}
                    disabled={!canWrite}
                    onChange={(e) =>
                      setDraft((d) => {
                        const rows = [...d.whyChooseUs];
                        rows[index] = { ...rows[index], description: e.target.value };
                        return { ...d, whyChooseUs: rows };
                      })
                    }
                  />
                </Field>
              </RowShell>
            ))}
            {saveButton("whyChooseUs")}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Facilities ── */}
      <TabsContent value="facilities">
        <Card>
          <CardContent className="flex flex-col gap-5 p-6">
            <Field
              label="Facilities"
              htmlFor="facilities-list"
              hint="One per line. The first six are shown on the about page."
              error={errorFor("facilities.0")}
            >
              <Textarea
                id="facilities-list"
                rows={10}
                value={draft.facilities}
                disabled={!canWrite}
                onChange={(e) => setDraft((d) => ({ ...d, facilities: e.target.value }))}
              />
            </Field>
            {saveButton("facilities")}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Every course includes ── */}
      <TabsContent value="everyCourseIncludes">
        <Card>
          <CardContent className="flex flex-col gap-5 p-6">
            <Field
              label="Standard benefits"
              htmlFor="includes-list"
              hint="One per line. Shown on /courses and on every course page."
              error={errorFor("everyCourseIncludes.0")}
            >
              <Textarea
                id="includes-list"
                rows={10}
                value={draft.everyCourseIncludes}
                disabled={!canWrite}
                onChange={(e) => setDraft((d) => ({ ...d, everyCourseIncludes: e.target.value }))}
              />
            </Field>
            {saveButton("everyCourseIncludes")}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
