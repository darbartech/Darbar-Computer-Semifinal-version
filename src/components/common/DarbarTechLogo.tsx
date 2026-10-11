import Image from "next/image";
import { cn } from "@/lib/utils";

const FALLBACK_LOGO_SRC = "/images/logo/final-logo.png";

interface DarbarTechLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  variant?: "light" | "dark";
  priority?: boolean;
  /** Resolved `general.logoUrl`; falls back to the bundled logo when empty. */
  logoUrl?: string | null;
  /** Accessible name; callers pass the live site name. */
  alt?: string;
}

export function DarbarTechLogo({
  className = "",
  size = "md",
  showText: _showText = true,
  variant: _variant = "light",
  priority = false,
  logoUrl,
  alt = "DarbarTech Group of Technology",
}: DarbarTechLogoProps) {
  const sizeMap: Record<NonNullable<DarbarTechLogoProps["size"]>, number> = {
    sm: 40,
    md: 48,
    lg: 60,
  };
  const heightPx = sizeMap[size];

  const dynamicSrc = logoUrl?.trim();
  const src = dynamicSrc || FALLBACK_LOGO_SRC;

  return (
    <span className={cn("inline-flex items-center shrink-0", className)}>
      <Image
        src={src}
        width={Math.round(heightPx * 1.942)}
        height={heightPx}
        alt={alt}
        className="h-auto w-auto object-contain"
        style={{ height: heightPx }}
        priority={priority}
        unoptimized={Boolean(dynamicSrc)}
      />
    </span>
  );
}
