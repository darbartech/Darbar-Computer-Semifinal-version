"use client";
import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  ExternalLink,
  UserCircle,
  LogOut,
  KeyRound,
  Settings as SettingsIcon,
  ChevronsUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { Role } from "@/generated/prisma/client";
import { signOut } from "@/server/actions/auth";
import { cn } from "@/lib/utils";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
}

interface AdminTopbarProps {
  user: AdminUser;
  mobileMenuTrigger?: React.ReactNode;
}

const roleLabels: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  EDITOR: "Editor",
  COUNSELOR: "Counselor",
  STUDENT: "Student",
};

export function AdminTopbar({ user, mobileMenuTrigger }: AdminTopbarProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleLogout = async () => {
    setIsSigningOut(true);
    await signOut();
    router.push("/techdarbar/login");
    router.refresh();
  };

  return (
    <header className={cn(
      "sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-neutral-200 bg-white/90 backdrop-blur px-4 md:px-6",
      "md:pl-[17.5rem]"
    )}>
      {mobileMenuTrigger}

      <div className="relative flex-1 max-w-md hidden sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
        <Input
          placeholder="Search leads, courses, content…"
          className="pl-9 bg-neutral-50 border-neutral-200"
          disabled
        />
      </div>

      <div className="flex-1 sm:hidden" />

      <Link
        href="/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-neutral-100"
      >
        <ExternalLink className="size-4" />
        <span className="hidden sm:inline">View site</span>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 pl-1.5 pr-2 h-9">
            <span className="size-8 shrink-0 inline-flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold overflow-hidden">
              {user.image ? (
                <Image
                  src={user.image}
                  alt=""
                  width={32}
                  height={32}
                  className="size-8 object-cover"
                />
              ) : (
                initials || <UserCircle className="size-5" />
              )}
            </span>
            <div className="hidden sm:block text-left min-w-0">
              <div className="text-sm font-medium text-neutral-900 truncate max-w-[140px]">
                {user.name}
              </div>
              <div className="text-xs text-neutral-500 truncate max-w-[140px]">
                {roleLabels[user.role]}
              </div>
            </div>
            <ChevronsUpDown className="size-3.5 text-neutral-500 hidden sm:block" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <div className="px-3 py-2 border-b border-neutral-100 mb-1">
            <div className="text-sm font-semibold text-neutral-900 truncate">{user.name}</div>
            <div className="text-xs text-neutral-500 truncate">{user.email}</div>
          </div>
          <DropdownMenuItem asChild>
            <Link href="/techdarbar/account">
              <UserCircle className="size-4 text-neutral-500" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <KeyRound className="size-4 text-neutral-500" />
            Change password
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/techdarbar/settings">
              <SettingsIcon className="size-4 text-neutral-500" />
              Settings
            </Link>
          </DropdownMenuItem>
          <div className="my-1 border-t border-neutral-100" />
          <DropdownMenuItem
            onSelect={handleLogout}
            className={
              isSigningOut
                ? "text-neutral-400 hover:bg-transparent"
                : "text-destructive hover:bg-destructive/5"
            }
          >
            <LogOut className="size-4" />
            {isSigningOut ? "Logging out…" : "Log out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
