"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2,
  Save,
  Phone,
  MapPin,
  Link2,
  Code,
  Contact,
  Globe,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { updateStudentProfileAction } from "@/server/actions/student";
import type { StudentProfileView } from "@/server/dal/students";
import { cn } from "@/lib/utils";

/**
 * Local form schema: every field is a plain string/boolean (no transforms), so
 * the RHF field-value type matches the resolved type exactly. The server action
 * re-validates with the authoritative `studentProfileSchema`.
 */
const FormSchema = z.object({
  phone: z.string().max(20, "Phone is too long"),
  dateOfBirth: z.string(),
  address: z.string().max(200, "Address is too long"),
  city: z.string().max(100, "City is too long"),
  country: z.string().max(100, "Country is too long"),
  headline: z.string().max(140, "Headline is too long"),
  bio: z.string().max(2000, "Bio is too long"),
  skills: z.string(),
  interests: z.string(),
  githubUrl: z.string().max(300, "URL is too long"),
  linkedinUrl: z.string().max(300, "URL is too long"),
  websiteUrl: z.string().max(300, "URL is too long"),
  portfolioSlug: z.string().max(50, "Slug is too long"),
  portfolioPublic: z.boolean(),
});

type FormValues = z.infer<typeof FormSchema>;

function splitTags(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(/[,\n]/)) {
    const item = raw.trim().slice(0, 40);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 30) break;
  }
  return out;
}

export function ProfileForm({ profile }: { profile: StudentProfileView }) {
  const { toast } = useToast();
  const router = useRouter();
  const locked = profile.approvalStatus !== "APPROVED";
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      phone: profile.phone ?? "",
      dateOfBirth: profile.dateOfBirth ?? "",
      address: profile.address ?? "",
      city: profile.city ?? "",
      country: profile.country ?? "Nepal",
      headline: profile.headline ?? "",
      bio: profile.bio ?? "",
      skills: profile.skills.join(", "),
      interests: profile.interests.join(", "),
      githubUrl: profile.githubUrl ?? "",
      linkedinUrl: profile.linkedinUrl ?? "",
      websiteUrl: profile.websiteUrl ?? "",
      portfolioSlug: profile.portfolioSlug ?? "",
      portfolioPublic: profile.portfolioPublic,
    },
  });

  const onSubmit = async (data: FormValues) => {
    const result = await updateStudentProfileAction({
      phone: data.phone,
      dateOfBirth: data.dateOfBirth,
      address: data.address,
      city: data.city,
      country: data.country,
      headline: data.headline,
      bio: data.bio,
      skills: splitTags(data.skills),
      interests: splitTags(data.interests),
      githubUrl: data.githubUrl,
      linkedinUrl: data.linkedinUrl,
      websiteUrl: data.websiteUrl,
      portfolioSlug: data.portfolioSlug.trim().toLowerCase(),
      portfolioPublic: data.portfolioPublic,
    });

    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) setError(field as keyof FormValues, { message: messages[0] });
      }
      toast({ title: result.error, variant: "error" });
      return;
    }

    toast({ title: "Profile saved", variant: "success" });
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <Card>
        <CardContent className="p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-neutral-900">Personal details</h2>
            <p className="text-sm text-neutral-600 mt-0.5">
              Your name and email come from your account. These contact details stay private.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="flex items-center gap-1.5">
                <Phone className="size-3.5 text-neutral-500" />
                Phone
              </Label>
              <Input id="phone" type="tel" autoComplete="tel" placeholder="98XXXXXXXX" {...register("phone")} />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dateOfBirth">Date of birth</Label>
              <Input id="dateOfBirth" type="date" {...register("dateOfBirth")} />
              {errors.dateOfBirth && (
                <p className="text-xs text-destructive">{errors.dateOfBirth.message}</p>
              )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="address" className="flex items-center gap-1.5">
                <MapPin className="size-3.5 text-neutral-500" />
                Address <span className="text-neutral-400 font-normal">(private)</span>
              </Label>
              <Input id="address" placeholder="Street / locality" {...register("address")} />
              {errors.address && <p className="text-xs text-destructive">{errors.address.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" placeholder="Kathmandu" {...register("city")} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="country">Country</Label>
              <Input id="country" placeholder="Nepal" {...register("country")} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-neutral-900">Profile &amp; skill</h2>
            <p className="text-sm text-neutral-600 mt-0.5">
              Shown on your public portfolio when it is switched on.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="headline">Headline</Label>
            <Input
              id="headline"
              placeholder="e.g. Aspiring full-stack developer"
              {...register("headline")}
            />
            {errors.headline && <p className="text-xs text-destructive">{errors.headline.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bio">About you</Label>
            <Textarea
              id="bio"
              rows={5}
              placeholder="A short introduction — who you are and what you are learning."
              {...register("bio")}
            />
            {errors.bio && <p className="text-xs text-destructive">{errors.bio.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="skills" className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-neutral-500" />
              Skills
            </Label>
            <Input id="skills" placeholder="JavaScript, HTML, CSS, Figma" {...register("skills")} />
            <p className="text-[11px] text-neutral-500">Separate with commas.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="interests">Interests</Label>
            <Input id="interests" placeholder="Web development, AI, UI/UX" {...register("interests")} />
            <p className="text-[11px] text-neutral-500">Separate with commas.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-neutral-900">Links</h2>
            <p className="text-sm text-neutral-600 mt-0.5">
              Optional. Include the http:// or https:// prefix.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="githubUrl" className="flex items-center gap-1.5">
                <Code className="size-3.5 text-neutral-500" />
                GitHub
              </Label>
              <Input id="githubUrl" placeholder="https://github.com/username" {...register("githubUrl")} />
              {errors.githubUrl && <p className="text-xs text-destructive">{errors.githubUrl.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="linkedinUrl" className="flex items-center gap-1.5">
                <Contact className="size-3.5 text-neutral-500" />
                LinkedIn
              </Label>
              <Input id="linkedinUrl" placeholder="https://linkedin.com/in/username" {...register("linkedinUrl")} />
              {errors.linkedinUrl && (
                <p className="text-xs text-destructive">{errors.linkedinUrl.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="websiteUrl" className="flex items-center gap-1.5">
                <Globe className="size-3.5 text-neutral-500" />
                Website
              </Label>
              <Input id="websiteUrl" placeholder="https://yoursite.com" {...register("websiteUrl")} />
              {errors.websiteUrl && <p className="text-xs text-destructive">{errors.websiteUrl.message}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 sm:p-8 space-y-5">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-neutral-900">Public portfolio</h2>
            <p className="text-sm text-neutral-600 mt-0.5">
              Choose a public web address and decide whether your portfolio is visible.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="portfolioSlug" className="flex items-center gap-1.5">
              <Link2 className="size-3.5 text-neutral-500" />
              Portfolio URL
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-500 whitespace-nowrap">/portfolio/</span>
              <Input
                id="portfolioSlug"
                placeholder="ram-sharma"
                className={cn(errors.portfolioSlug && "border-destructive")}
                {...register("portfolioSlug")}
              />
            </div>
            {errors.portfolioSlug && (
              <p className="text-xs text-destructive">{errors.portfolioSlug.message}</p>
            )}
            <p className="text-[11px] text-neutral-500">
              Lowercase letters, numbers and hyphens. Required before you can turn the portfolio on.
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-neutral-200 p-4 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-neutral-300 text-primary focus:ring-primary"
              {...register("portfolioPublic")}
            />
            <span className="text-sm">
              <span className="font-medium text-neutral-900">Make my portfolio public</span>
              <span className="block text-neutral-600">
                Anyone with the link can view your skills, projects and issued certificates. Your
                phone, date of birth and address are never shown.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Button type="submit" size="lg" disabled={isSubmitting || locked}>
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save profile
          </Button>
          {isDirty && !locked && <span className="text-xs text-neutral-500">Unsaved changes</span>}
        </div>
        {locked && (
          <p className="text-xs text-amber-700">
            Saving unlocks after an admin approves your registration.
          </p>
        )}
      </div>
    </form>
  );
}
