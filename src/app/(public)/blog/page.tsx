import Image from 'next/image'
import Link from 'next/link'
import { Container } from '@/components/common/Container'
import { SectionHeading } from '@/components/common/SectionHeading'
import { Breadcrumbs } from '@/components/common/Breadcrumbs'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/common/Badge'
import { Calendar, Clock, ArrowRight, User, Newspaper } from 'lucide-react'
import { listPublishedBlogPosts } from '@/server/dal/blog'
import { getSiteSettings } from '@/server/dal/settings'
import { buildMetadata } from '@/lib/seo'
import { cn } from '@/lib/utils'

type BlogPostVM = Awaited<ReturnType<typeof listPublishedBlogPosts>>[number]
type TagVM = BlogPostVM['tags'][number]

export async function generateMetadata() {
  return buildMetadata(
    {
      title: 'Career & Tech Guides for Nepal',
      path: '/blog',
      description:
        'Career guidance, course comparisons, and success stories to help you choose and grow your tech career in Nepal.',
    },
    await getSiteSettings()
  )
}

export default async function BlogPage() {
  const posts = await listPublishedBlogPosts()
  return (
    <>
      <div className="bg-neutral-50 border-b border-neutral-200">
        <Container size="xl" className="pt-4 pb-8 sm:pb-12">
          <Breadcrumbs items={[{ label: "Blog" }]} />
          <SectionHeading
            as="h1"
            eyebrow="Insights"
            title="Career & Tech Guides for Nepal"
            description="Career guidance, course comparisons, and success stories to help you choose and grow your tech career in Nepal."
            className="mt-2"
          />
        </Container>
      </div>

      <section className="py-12 sm:py-16">
        <Container size="xl">
          {posts.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-neutral-50 p-12 sm:p-16 text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-200 text-neutral-500">
                <Calendar className="size-7" />
              </div>
              <h3 className="text-xl font-semibold text-neutral-900">No posts yet</h3>
              <p className="mt-2 text-neutral-600 max-w-md mx-auto leading-relaxed">
                New career guides, course comparisons, and success stories are being prepared. Check back soon.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post: BlogPostVM) => (
                <Card key={post.id} className="group h-full flex flex-col overflow-hidden">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="relative block overflow-hidden aspect-[16/10] bg-neutral-100"
                  >
                    {post.cover?.url ? (
                      <Image
                        src={post.cover.url}
                        alt={post.title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div
                        className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 via-neutral-50 to-secondary/10"
                        aria-hidden="true"
                      >
                        <Newspaper className="size-10 text-primary/30" />
                      </div>
                    )}
                  </Link>
                  <CardContent className="flex-1 pt-5 pb-5 flex flex-col">
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      {post.tags?.slice(0, 2).map((t: TagVM) => (
                        <Badge key={t.id} variant="default">
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                    <Link
                      href={`/blog/${post.slug}`}
                      className="font-semibold text-[16px] tracking-tight text-neutral-900 hover:text-primary transition-colors line-clamp-2 leading-snug"
                    >
                      {post.title}
                    </Link>
                    <p className="mt-2 text-sm text-neutral-600 leading-relaxed line-clamp-2">
                      {post.excerpt}
                    </p>
                    <div className="mt-auto pt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-neutral-500">
                      <span className="inline-flex items-center gap-1.5">
                        <User className="size-3.5 text-primary" aria-hidden="true" />
                        {post.author?.name || post.authorName || "Darbar Computer"}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="size-3.5 text-primary" aria-hidden="true" />
                        {new Date(post.publishedAt || post.createdAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="size-3.5 text-primary" aria-hidden="true" />
                        {post.readingMinutes ?? 0} min read
                      </span>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-0 pb-5">
                    <Link
                      href={`/blog/${post.slug}`}
                      className={cn(
                        buttonVariants({ variant: 'ghost', size: 'sm' }),
                        'group/btn p-0 h-auto text-primary hover:text-primary hover:bg-transparent'
                      )}
                    >
                      Read Article
                      <ArrowRight className="size-4 ml-1 transition-transform group-hover/btn:translate-x-0.5" aria-hidden="true" />
                    </Link>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </Container>
      </section>
    </>
  )
}
