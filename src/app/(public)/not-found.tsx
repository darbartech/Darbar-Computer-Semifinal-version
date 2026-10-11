import Link from "next/link";
import { Container } from "@/components/common/Container";
import { buttonVariants } from "@/components/ui/button";
import { buildMetadata } from "@/lib/seo";
import { Home, Compass, ArrowRight, Search } from "lucide-react";

export const metadata = buildMetadata({
  title: "404 — Page Not Found",
  path: "/404",
  description: "This page doesn't exist at Darbar Computer.",
});

export default function NotFound() {
  return (
    <div className="flex-1 flex items-center">
      <Container size="md" className="py-20 sm:py-28 text-center">
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Search className="size-10" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          404 Error
        </p>
        <h1 className="mt-2 text-4xl sm:text-5xl font-extrabold tracking-tight text-neutral-900 text-balance">
          Page not found
        </h1>
        <p className="mt-4 text-base sm:text-lg text-neutral-600 max-w-lg mx-auto leading-relaxed">
          Sorry, we couldn&apos;t find the page you were looking for. It may have been moved or no longer exists.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/" className={buttonVariants({ size: "lg" })}>
            <Home className="size-5" />
            Back to Home
          </Link>
          <Link href="/courses" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Compass className="size-5" />
            Browse Courses
            <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-12 text-sm text-neutral-500">
          Still stuck?{" "}
          <Link href="/contact" className="text-primary hover:underline font-medium">
            Contact us
          </Link>{" "}
          for help.
        </div>
      </Container>
    </div>
  );
}
