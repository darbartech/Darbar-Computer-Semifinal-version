export interface BlogPostFrontmatter {
  title: string;
  slug: string;
  excerpt: string;
  date: string;
  cover: string;
  author: string;
  tags: string[];
  isDraft?: boolean;
}

export interface BlogPost extends BlogPostFrontmatter {
  content: string;
  readingTime: string;
}
