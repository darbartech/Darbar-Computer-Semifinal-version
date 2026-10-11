"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutStudent } from "@/server/actions/student-auth";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const onLogout = async () => {
    setPending(true);
    try {
      await logoutStudent();
      router.push("/student/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={onLogout} disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
      Sign out
    </Button>
  );
}
