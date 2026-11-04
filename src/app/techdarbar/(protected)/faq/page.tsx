import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HelpCircle, Plus, Trash2, Edit3, Save, FolderOpen } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { requirePermission } from "@/server/session";
import { adminListFaqCategories } from "@/server/dal/faq";
import { saveFaqCategory, saveFaq, deleteFaqAction } from "@/server/actions/faq";

export const metadata: Metadata = {
  title: "FAQ Manager",
  robots: { index: false, follow: false },
};

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * The actions in `@/server/actions/faq` take plain objects, so every form on
 * this page needs a wrapper that reads the FormData first. Passing the actions
 * straight to `<form action={...}>` handed them a FormData instance, Zod
 * rejected it, and the ActionResult was thrown away — nothing was ever saved.
 */
function backToFaq(result: ActionResult): never {
  if (result.ok) redirect("/techdarbar/faq?saved=1");
  redirect(`/techdarbar/faq?error=${encodeURIComponent(result.error)}`);
}

async function handleSaveFaqCategory(formData: FormData) {
  "use server";
  const result = await saveFaqCategory({
    id: String(formData.get("id") ?? ""),
    name: String(formData.get("name") ?? ""),
    sortOrder: String(formData.get("sortOrder") ?? "0"),
  });
  backToFaq(result);
}

async function handleSaveFaq(formData: FormData) {
  "use server";
  const result = await saveFaq({
    id: String(formData.get("id") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    question: String(formData.get("question") ?? ""),
    answer: String(formData.get("answer") ?? ""),
    sortOrder: String(formData.get("sortOrder") ?? "0"),
    isPublished: formData.get("isPublished") === "on",
  });
  backToFaq(result);
}

async function handleDeleteFaq(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  backToFaq(await deleteFaqAction(id));
}

export default async function AdminFaqPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("faq.write");
  // Next.js 16: searchParams is a Promise.
  const sp = await searchParams;

  const categories = await adminListFaqCategories();
  const allFaqs = categories.flatMap((cat) =>
    cat.faqs.map((faq) => ({ ...faq, categoryName: cat.name }))
  );

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/techdarbar" }, { label: "FAQ" }]}
      />

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          <HelpCircle className="size-6 text-primary" />
          FAQ Manager
        </h1>
        <p className="text-sm text-neutral-600">
          Manage FAQ categories and questions. Changes publish immediately.
        </p>
      </div>

      {sp.error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive"
        >
          {sp.error}
        </p>
      )}
      {sp.saved && (
        <p className="rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm font-medium text-success">
          Saved. The public FAQ page picks this up on the next refresh.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FolderOpen className="size-5 text-primary" />
              Categories
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={handleSaveFaqCategory} className="space-y-3 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 p-3">
              <p className="text-xs font-medium text-neutral-600">New category</p>
              <div className="space-y-1.5">
                <Label htmlFor="cat-name">Name</Label>
                <Input id="cat-name" name="name" placeholder="e.g. Admissions" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-sort">Sort order</Label>
                <Input id="cat-sort" name="sortOrder" type="number" min={0} max={9999} defaultValue={0} />
              </div>
              <Button type="submit" size="sm" className="w-full">
                <Plus className="size-4" />
                Add category
              </Button>
            </form>

            <div className="space-y-2">
              {categories.length === 0 && (
                <p className="py-6 text-center text-sm text-neutral-500">
                  No categories yet. Create one above.
                </p>
              )}
              {categories.map((cat) => (
                <form
                  key={cat.id}
                  action={handleSaveFaqCategory}
                  className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-2.5"
                >
                  <input type="hidden" name="id" value={cat.id} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <Input
                      name="name"
                      defaultValue={cat.name}
                      className="h-9"
                      required
                    />
                    <input
                      type="hidden"
                      name="sortOrder"
                      value={cat.sortOrder ?? 0}
                    />
                  </div>
                  <Button type="submit" variant="ghost" size="icon-xs" aria-label={`Save ${cat.name}`}>
                    <Save className="size-3.5" />
                  </Button>
                </form>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <HelpCircle className="size-5 text-primary" />
                New FAQ
              </CardTitle>
            </CardHeader>
            <CardContent>
<form action={handleSaveFaq} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="faq-question">Question</Label>
                    <Input id="faq-question" name="question" placeholder="How do I enroll in a course?" maxLength={500} required />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="faq-answer">Answer</Label>
                    <Textarea id="faq-answer" name="answer" placeholder="Detailed answer goes here..." maxLength={5000} rows={4} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="faq-category">Category</Label>
                    <Select
                      id="faq-category"
                      name="categoryId"
                      placeholder="Select a category"
                      options={categories.map((c) => ({ value: c.id, label: c.name }))}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="faq-sort">Sort order</Label>
                    <Input id="faq-sort" name="sortOrder" type="number" min={0} max={9999} defaultValue={0} />
                  </div>
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <input
                      type="checkbox"
                      id="faq-published"
                      name="isPublished"
                      defaultChecked
                      className="size-4 rounded border-neutral-300 text-primary focus:ring-primary"
                    />
                    <Label htmlFor="faq-published" className="!mb-0">Published</Label>
                  </div>
                </div>
                <Button type="submit">
                  <Plus className="size-4" />
                  Add FAQ
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-lg">
                  All FAQs
                  <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
                    {allFaqs.length}
                  </span>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {allFaqs.length === 0 && (
                <p className="py-8 text-center text-sm text-neutral-500">
                  No FAQs yet. Add one using the form above.
                </p>
              )}
              {allFaqs.map((faq) => (
                <FaqEditRow key={faq.id} faq={faq} categories={categories} />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function FaqEditRow({
  faq,
  categories,
}: {
  faq: {
    id: string;
    question: string;
    answer: string;
    categoryId: string;
    categoryName: string;
    isPublished: boolean;
    sortOrder: number;
  };
  categories: { id: string; name: string }[];
}) {
  const shortAnswer = faq.answer.length > 140 ? faq.answer.slice(0, 140) + "…" : faq.answer;

  return (
    <details className="group rounded-xl border border-neutral-200 bg-white open:bg-neutral-50/40">
      <summary className="flex cursor-pointer list-none items-start gap-3 p-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-neutral-900">{faq.question}</p>
            <span
              className={
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
                (faq.isPublished
                  ? "bg-success/10 text-success"
                  : "bg-neutral-200 text-neutral-600")
              }
            >
              {faq.isPublished ? "Published" : "Draft"}
            </span>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {faq.categoryName}
            </span>
          </div>
          <p className="text-sm text-neutral-600 line-clamp-1">{shortAnswer}</p>
          <p className="text-xs text-neutral-400">Sort: {faq.sortOrder}</p>
        </div>
        <Edit3 className="mt-0.5 size-4 shrink-0 text-neutral-400 transition-transform group-open:rotate-45" />
      </summary>
      <div className="border-t border-neutral-200 p-4 space-y-3">
        <form action={handleSaveFaq} className="space-y-4">
          <input type="hidden" name="id" value={faq.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Question</Label>
              <Input name="question" defaultValue={faq.question} maxLength={500} required />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Answer</Label>
              <Textarea name="answer" defaultValue={faq.answer} maxLength={5000} rows={5} required />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                name="categoryId"
                defaultValue={faq.categoryId}
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sort order</Label>
              <Input name="sortOrder" type="number" min={0} max={9999} defaultValue={faq.sortOrder} />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                id={`faq-pub-${faq.id}`}
                name="isPublished"
                defaultChecked={faq.isPublished}
                className="size-4 rounded border-neutral-300 text-primary focus:ring-primary"
              />
              <Label htmlFor={`faq-pub-${faq.id}`} className="!mb-0">Published</Label>
            </div>
          </div>
          <Button type="submit" size="sm">
            <Save className="size-4" />
            Save changes
          </Button>
        </form>
        <form action={handleDeleteFaq}>
          <input type="hidden" name="id" value={faq.id} />
          <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/5">
            <Trash2 className="size-4" />
            Delete FAQ
          </Button>
        </form>
      </div>
    </details>
  );
}
