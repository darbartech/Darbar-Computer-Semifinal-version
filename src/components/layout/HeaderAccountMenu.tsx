"use client";
import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  LogIn,
  LogOut,
  UserPlus,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutStudent } from "@/server/actions/student-auth";
import { cn } from "@/lib/utils";

type StudentChip = { name: string; photoUrl: string | null };

/**
 * Header account area. Resolves the signed-in student client-side via
 * `/api/student/me` so public pages stay statically renderable; visitors and
 * staff keep the plain Log In / Sign Up menu.
 */
export function useStudentChip(): StudentChip | null {
  const [chip, setChip] = React.useState<StudentChip | null>(null);
  const pathname = usePathname();

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/student/me")
      .then((response) => (response.ok ? response.json() : { student: null }))
      .then((data: { student: StudentChip | null }) => {
        if (!cancelled) setChip(data.student);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return chip;
}

function Avatar({ chip, className }: { chip: StudentChip; className?: string }) {
  if (chip.photoUrl) {
    return (
      <Image
        src={chip.photoUrl}
        alt=""
        width={32}
        height={32}
        className={cn("size-8 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary",
        className
      )}
      aria-hidden="true"
    >
      {chip.name.charAt(0).toUpperCase()}
    </span>
  );
}

export function HeaderAccountMenu() {
  const chip = useStudentChip();
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await logoutStudent();
      router.push("/");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  if (chip) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="hidden sm:inline-flex overflow-hidden"
            aria-label={`Student account for ${chip.name}`}
          >
            <Avatar chip={chip} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <div className="px-2 py-1.5">
            <p className="text-sm font-medium text-neutral-900 truncate">{chip.name}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/student">
              <LayoutDashboard className="size-4" aria-hidden="true" />
              My portal
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={signingOut}
            onSelect={onSignOut}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {signingOut ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Link
      href="/student/login"
      className={cn(
        buttonVariants({ variant: "outline" }),
        "hidden sm:inline-flex h-11 px-4 gap-2"
      )}
      aria-label="Student sign in"
    >
      <LogIn className="size-4" aria-hidden="true" />
      Sign In
    </Link>
  );
}

export function HeaderAccountSheetBlock({ onClose }: { onClose: () => void }) {
  const chip = useStudentChip();
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    onClose();
    try {
      await logoutStudent();
      router.push("/");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  if (chip) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
        <div className="flex items-center gap-3 mb-2">
          <Avatar chip={chip} className="size-9" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900 truncate">{chip.name}</p>
            <p className="text-xs text-neutral-500">Student account</p>
          </div>
        </div>
        <div className="space-y-2">
          <Link
            href="/student"
            className={cn(buttonVariants({ variant: "outline" }), "w-full h-11 justify-start")}
          >
            <LayoutDashboard className="size-5" aria-hidden="true" />
            My portal
          </Link>
          <Button
            variant="outline"
            className="w-full h-11 justify-start text-destructive hover:text-destructive"
            disabled={signingOut}
            onClick={onSignOut}
          >
            <LogOut className="size-5" aria-hidden="true" />
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500 mb-2">
        Your Account
      </div>
      <div className="space-y-2">
        <Link
          href="/student/login"
          className={cn(buttonVariants({ variant: "outline" }), "w-full h-11 justify-start")}
        >
          <LogIn className="size-5" aria-hidden="true" />
          Sign In
        </Link>
        <Link
          href="/student/register"
          className={cn(buttonVariants({ variant: "outline" }), "w-full h-11 justify-start")}
        >
          <UserPlus className="size-5" aria-hidden="true" />
          Sign Up
        </Link>
      </div>
    </div>
  );
}
