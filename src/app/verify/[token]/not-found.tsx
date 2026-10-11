import Link from "next/link";
import { ArrowLeft, Search, ShieldX } from "lucide-react";
import { Container } from "@/components/common/Container";
import { buttonVariants } from "@/components/ui/button";

export default function VerifyNotFound() {
  return (
    <Container className="py-16 sm:py-24">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <div className="mb-6 rounded-full bg-destructive/10 p-4 text-destructive">
          <ShieldX className="size-10" />
        </div>
        <h1 className="mb-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          Certificate not found or invalid
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-neutral-600">
          We could not locate a valid certificate matching this link. The link
          may be mistyped, expired, or the record may have never been issued.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/verify" className={buttonVariants()}>
            <Search className="size-4" />
            Search by certificate number
          </Link>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft className="size-4" />
            Back to home
          </Link>
        </div>
        <div className="mt-3">
          <Link
            href="/contact"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-primary"
          >
            Contact us for help →
          </Link>
        </div>
        <p className="mt-10 text-[11px] uppercase tracking-wider text-neutral-500">
          If you believe this is an error, quote the URL shown in your browser
          when contacting support. We cannot share details about invalid tokens.
        </p>
      </div>
    </Container>
  );
}
