import fs from "fs";
import path from "path";
import matter from "gray-matter";
import readingTime from "reading-time";
import type { BlogPost, BlogPostFrontmatter } from "@/types/blog-post";

const BLOG_DIR = path.join(process.cwd(), "src", "content", "blog");

function ensureDir() {
  try {
    if (!fs.existsSync(BLOG_DIR)) return [];
    return fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith(".mdx") || f.endsWith(".md"));
  } catch {
    return [];
  }
}

function readPost(filename: string): BlogPost | null {
  try {
    const filePath = path.join(BLOG_DIR, filename);
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data, content } = matter(raw);
    const stats = readingTime(content);
    const fm = data as BlogPostFrontmatter;
    return {
      ...fm,
      cover: fm.cover,
      content,
      readingTime: stats.text,
    };
  } catch (e) {
    console.error(`[blog-posts] Failed to read ${filename}:`, e);
    return null;
  }
}

export function getAllBlogPosts(): BlogPost[] {
  const files = ensureDir();
  const posts = files
    .map((f) => readPost(f))
    .filter((p): p is BlogPost => !!p && !p.isDraft)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return posts;
}

export function getBlogPostBySlug(slug: string): BlogPost | null {
  const all = getAllBlogPosts();
  return all.find((p) => p.slug === slug) ?? null;
}

export function getAllBlogSlugs(): { slug: string }[] {
  return getAllBlogPosts().map((p) => ({ slug: p.slug }));
}

export function getRelatedPosts(post: BlogPost, count = 3): BlogPost[] {
  const postTags = new Set(post.tags ?? []);
  return getAllBlogPosts()
    .filter((p) => p.slug !== post.slug)
    .map((p) => {
      const shared = (p.tags ?? []).filter((t) => postTags.has(t)).length;
      return { post: p, score: shared };
    })
    .sort((a, b) => b.score - a.score || new Date(b.post.date).getTime() - new Date(a.post.date).getTime())
    .slice(0, count)
    .map((x) => x.post);
}

export function getAllTags(): string[] {
  const set = new Set<string>();
  getAllBlogPosts().forEach((p) => (p.tags ?? []).forEach((t) => set.add(t)));
  return Array.from(set).sort();
}
