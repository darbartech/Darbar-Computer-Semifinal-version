"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UsersRound,
  MessageSquare,
  BookOpen,
  Layers,
  Newspaper,
  Calendar,
  HelpCircle,
  Images,
  MessageSquareText,
  Users,
  FolderOpen,
  Settings,
  ShieldUser,
  FileText,
  Menu,
  Award,
  Signature,
  LayoutTemplate,
  GraduationCap,
  ClipboardList,
  Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/common/Badge";
import { DarbarTechLogo } from "@/components/common/DarbarTechLogo";
import { can, type PermissionAction } from "@/server/permissions";
import type { Role } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

type SidebarItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: PermissionAction;
  badge?: {
    permission: PermissionAction;
    label: string;
    /** When set the badge shows this live count and hides itself at zero. */
    count?: number;
  };
};

type SidebarSection = {
  label: string;
  items: SidebarItem[];
};

type SidebarCounts = {
  awaitingReview?: number;
};

function buildNav(counts: SidebarCounts): SidebarSection[] {
  return [
    {
      label: "",
      items: [
        { label: "Dashboard", href: "/techdarbar", icon: LayoutDashboard, permission: "dashboard.view" },
      ],
    },
    {
      label: "Admissions",
      items: [
        {
          label: "Leads",
          href: "/techdarbar/leads",
          icon: UsersRound,
          permission: "lead.read",
          badge: { permission: "lead.read", label: "New" },
        },
        {
          label: "Contact messages",
          href: "/techdarbar/messages",
          icon: MessageSquare,
          permission: "contact.read",
          badge: { permission: "contact.read", label: "Unread" },
        },
        { label: "Students", href: "/techdarbar/students", icon: GraduationCap, permission: "student.read" },
      ],
    },
    {
      label: "Catalog",
      items: [
        { label: "Courses", href: "/techdarbar/courses", icon: BookOpen, permission: "course.read" },
        {
          label: "Assignments",
          href: "/techdarbar/assignments",
          icon: ClipboardList,
          permission: "assignment.read",
          badge: {
            permission: "assignment.read",
            label: "to review",
            count: counts.awaitingReview,
          },
        },
        { label: "Categories", href: "/techdarbar/categories", icon: Layers, permission: "category.manage" },
      ],
    },
    {
      label: "Website",
      items: [
        { label: "Blog", href: "/techdarbar/blog", icon: Newspaper, permission: "blog.write" },
        { label: "Events", href: "/techdarbar/events", icon: Calendar, permission: "events.write" },
        { label: "FAQ", href: "/techdarbar/faq", icon: HelpCircle, permission: "faq.write" },
        { label: "Gallery", href: "/techdarbar/gallery", icon: Images, permission: "gallery.write" },
        { label: "Testimonials", href: "/techdarbar/testimonials", icon: MessageSquareText, permission: "testimonials.write" },
        { label: "Notices", href: "/techdarbar/notices", icon: Megaphone, permission: "notice.read" },
        { label: "Team", href: "/techdarbar/team", icon: Users, permission: "team.write" },
        { label: "Media library", href: "/techdarbar/media", icon: FolderOpen, permission: "media.read" },
        { label: "Site settings", href: "/techdarbar/settings", icon: Settings, permission: "settings.read" },
      ],
    },
    {
      label: "Certificates",
      items: [
        { label: "Certificates", href: "/techdarbar/certificates", icon: Award, permission: "certificate.read" },
        { label: "Signatories", href: "/techdarbar/signatories", icon: Signature, permission: "certificate.signatory.manage" },
        { label: "Templates", href: "/techdarbar/templates", icon: LayoutTemplate, permission: "certificate.template.manage" },
      ],
    },
    {
      label: "System",
      items: [
        { label: "Users", href: "/techdarbar/users", icon: ShieldUser, permission: "user.manage" },
        { label: "Audit log", href: "/techdarbar/audit-log", icon: FileText, permission: "audit.view" },
      ],
    },
  ];
}

interface SidebarNavProps {
  role: Role;
  pathname: string;
  counts?: SidebarCounts;
  onNavigate?: () => void;
}

function SidebarNav({ role, pathname, counts = {}, onNavigate }: SidebarNavProps) {
  const sections = buildNav(counts);

  return (
    <nav className="flex flex-col gap-5 py-4">
      {sections.map((section) => {
        const visibleItems = section.items.filter(
          (item) => !item.permission || can(role, item.permission)
        );
        if (visibleItems.length === 0) return null;

        return (
          <div key={section.label || "root"} className="flex flex-col gap-1">
            {section.label && (
              <div className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                {section.label}
              </div>
            )}
            {visibleItems.map((item) => {
              const isActive =
                item.href === "/techdarbar"
                  ? pathname === "/techdarbar"
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              const showBadge =
                item.badge &&
                can(role, item.badge.permission) &&
                (item.badge.count === undefined || item.badge.count > 0);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      isActive ? "text-primary" : "text-neutral-500 group-hover:text-neutral-700"
                    )}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {showBadge && item.badge && (
                    <Badge
                      variant="accent"
                      title={
                        item.badge.count === undefined
                          ? undefined
                          : `${item.badge.count} assignment link${item.badge.count === 1 ? "" : "s"} waiting for review`
                      }
                    >
                      {item.badge.count ?? item.badge.label}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

interface AdminSidebarProps {
  role: Role;
  siteName: string;
  logoUrl?: string | null;
  awaitingReview?: number;
}

export function AdminSidebar({ role, siteName, logoUrl, awaitingReview }: AdminSidebarProps) {
  const pathname = usePathname() ?? "";
  const counts: SidebarCounts = { awaitingReview };

  return (
    <>
      <Sheet>
        <SheetTrigger>
          <Button variant="outline" size="icon-sm" className="md:hidden shrink-0" aria-label="Open sidebar">
            <Menu className="size-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 bg-white p-0 overflow-y-auto">
          <SheetHeader className="border-b border-neutral-200">
            <SheetTitle>{siteName} Admin</SheetTitle>
          </SheetHeader>
          <div className="px-3">
            <SidebarNav role={role} pathname={pathname} counts={counts} onNavigate={() => {}} />
          </div>
        </SheetContent>
      </Sheet>

      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:z-30 md:w-64 md:border-r md:border-neutral-200 md:bg-white md:shadow-sm">
        <div className="flex h-16 items-center gap-2 border-b border-neutral-200 px-4">
          <DarbarTechLogo size="sm" logoUrl={logoUrl} alt={siteName} />
          <span className="truncate font-bold text-base tracking-tight text-neutral-900">
            {siteName}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <SidebarNav role={role} pathname={pathname} counts={counts} />
        </div>
      </aside>
    </>
  );
}
