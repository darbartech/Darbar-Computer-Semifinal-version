"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Code,
  FolderGit2,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/common/Badge";
import {
  deletePortfolioProjectAction,
  savePortfolioProjectAction,
} from "@/server/actions/student";
import type { StudentProjectView } from "@/server/dal/students";

type ProjectFormValues = {
  title: string;
  description: string;
  techStack: string;
  liveUrl: string;
  repoUrl: string;
  isPublished: boolean;
};

const EMPTY: ProjectFormValues = {
  title: "",
  description: "",
  techStack: "",
  liveUrl: "",
  repoUrl: "",
  isPublished: true,
};

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

export function ProjectsManager({
  projects,
  portfolioSlug,
  locked = false,
}: {
  projects: StudentProjectView[];
  portfolioSlug: string | null;
  locked?: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<StudentProjectView | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<ProjectFormValues>({ defaultValues: EMPTY });

  const openCreate = () => {
    setEditing(null);
    reset(EMPTY);
    setOpen(true);
  };

  const openEdit = (project: StudentProjectView) => {
    setEditing(project);
    reset({
      title: project.title,
      description: project.description ?? "",
      techStack: project.techStack.join(", "),
      liveUrl: project.liveUrl ?? "",
      repoUrl: project.repoUrl ?? "",
      isPublished: project.isPublished,
    });
    setOpen(true);
  };

  const onSubmit = async (data: ProjectFormValues) => {
    const result = await savePortfolioProjectAction({
      id: editing?.id ?? "",
      title: data.title,
      description: data.description,
      techStack: splitTags(data.techStack),
      liveUrl: data.liveUrl,
      repoUrl: data.repoUrl,
      isPublished: data.isPublished,
      sortOrder: editing?.sortOrder ?? projects.length,
    });
    if (!result.ok) {
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({ title: editing ? "Project updated" : "Project added", variant: "success" });
    setOpen(false);
    router.refresh();
  };

  const onDelete = async (project: StudentProjectView) => {
    setDeletingId(project.id);
    try {
      const result = await deletePortfolioProjectAction({ id: project.id });
      if (!result.ok) {
        toast({ title: result.error, variant: "error" });
        return;
      }
      toast({ title: "Project removed", variant: "success" });
      router.refresh();
    } finally {
      // Without this the row stays spinner-locked if the action ever throws.
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-neutral-900">Projects</h2>
          <p className="text-sm text-neutral-600 mt-0.5">
            {portfolioSlug
              ? "These appear on your public portfolio."
              : "Add projects now — they show once you set a portfolio URL and make it public."}
          </p>
        </div>
        <Button onClick={openCreate} disabled={locked}>
          <Plus className="size-4" />
          Add project
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FolderGit2 className="size-6" />
            </div>
            <p className="font-medium text-neutral-900">No projects yet</p>
            <p className="text-sm text-neutral-600 mt-1">
              Showcase something you have built — a website, app, or class assignment.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {projects.map((project) => (
            <Card key={project.id} className="flex flex-col">
              <CardContent className="p-5 flex-1 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-neutral-900 leading-snug">{project.title}</h3>
                  {!project.isPublished && (
                    <Badge variant="outline" className="shrink-0">
                      <EyeOff className="size-3 mr-1" />
                      Hidden
                    </Badge>
                  )}
                </div>
                {project.description && (
                  <p className="text-sm text-neutral-600 line-clamp-3">{project.description}</p>
                )}
                {project.techStack.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {project.techStack.map((tech) => (
                      <Badge key={tech} variant="secondary" className="text-[10px]">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                  {project.liveUrl && (
                    <a
                      href={project.liveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="size-3" />
                      Live
                    </a>
                  )}
                  {project.repoUrl && (
                    <a
                      href={project.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 hover:underline"
                    >
                      <Code className="size-3" />
                      Code
                    </a>
                  )}
                  <span className="flex-1" />
                  <Button variant="ghost" size="sm" onClick={() => openEdit(project)} disabled={locked}>
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDelete(project)}
                    disabled={deletingId === project.id || locked}
                  >
                    {deletingId === project.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit project" : "Add project"}</DialogTitle>
              <DialogDescription>
                Describe what you built and the tools you used.
              </DialogDescription>
            </DialogHeader>

            <div className="px-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-1.5">
                <Label htmlFor="title">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="e.g. Portfolio website"
                  aria-invalid={!!errors.title}
                  {...register("title", { required: "Project title is required", maxLength: 120 })}
                />
                {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  rows={4}
                  placeholder="What it does, what you learned, the problem it solves…"
                  {...register("description")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="techStack">Tech stack</Label>
                <Input id="techStack" placeholder="React, Node.js, PostgreSQL" {...register("techStack")} />
                <p className="text-[11px] text-neutral-500">Separate with commas.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="liveUrl">Live URL</Label>
                  <Input id="liveUrl" placeholder="https://…" {...register("liveUrl")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="repoUrl">Repository URL</Label>
                  <Input id="repoUrl" placeholder="https://github.com/…" {...register("repoUrl")} />
                </div>
              </div>

              <label className="flex items-center gap-3 rounded-lg border border-neutral-200 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="size-4 rounded border-neutral-300 text-primary focus:ring-primary"
                  {...register("isPublished")}
                />
                <span className="text-sm text-neutral-800">Show this project on my portfolio</span>
              </label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || locked}>
                {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
                {editing ? "Save changes" : "Add project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
