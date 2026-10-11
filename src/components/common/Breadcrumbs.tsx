import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: CrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn("w-full py-3 text-sm", className)}>
      <ol className="flex flex-wrap items-center gap-1 text-neutral-600">
        <li>
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:text-primary hover:bg-primary/5 transition-colors"
          >
            <Home className="size-3.5" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Home</span>
          </Link>
        </li>
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={`${item.label}-${idx}`} className="flex items-center gap-1">
              <ChevronRight className="size-3.5 text-neutral-400" aria-hidden="true" />
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="rounded-md px-1.5 py-0.5 hover:text-primary hover:bg-primary/5 transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={cn("px-1.5 py-0.5 font-medium", isLast ? "text-neutral-900" : "text-neutral-600")} aria-current={isLast ? "page" : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
