"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, UserRound, BookOpen, Award, FolderGit2, Star, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/student", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/student/profile", label: "Profile", icon: UserRound, exact: false },
  { href: "/student/courses", label: "My Courses", icon: BookOpen, exact: false },
  { href: "/student/assignments", label: "Assignments", icon: ClipboardList, exact: false },
  { href: "/student/certificates", label: "Certificates", icon: Award, exact: false },
  { href: "/student/portfolio", label: "Portfolio", icon: FolderGit2, exact: false },
  { href: "/student/reviews", label: "Reviews", icon: Star, exact: false },
] as const;

export function StudentPortalNav({ locked = false }: { locked?: boolean }) {
  const pathname = usePathname();
  const links = locked ? LINKS.slice(0, 1) : LINKS;

  return (
    <nav aria-label="Student portal" className="flex gap-1 overflow-x-auto">
      {links.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
            )}
          >
            <Icon className="size-4" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
