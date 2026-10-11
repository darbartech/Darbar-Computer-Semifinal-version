"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function VerifySearchForm({
  initialValue = "",
}: {
  initialValue?: string;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(initialValue);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = value.trim();
    if (!code) return;
    router.push(`/verify?code=${encodeURIComponent(code)}`);
  };

  return (
    <form
      onSubmit={onSubmit}
      role="search"
      aria-label="Verify a certificate"
      className="flex w-full flex-col gap-3 sm:flex-row sm:items-center"
    >
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        name="code"
        type="text"
        autoComplete="off"
        placeholder="e.g. DT-CERT-2026-00125 or verification code"
        aria-label="Certificate number or verification code"
        className="flex-1"
      />
      <Button type="submit" disabled={!value.trim()}>
        <Search aria-hidden="true" />
        Verify certificate
      </Button>
    </form>
  );
}