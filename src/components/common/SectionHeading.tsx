"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useInView } from "@/components/common/Reveal";

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  variant?: "light" | "dark";
  className?: string;
  /** Use "h1" when this is the page's primary heading (one per page). */
  as?: "h1" | "h2" | "h3";
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  variant = "light",
  className,
  as: HeadingTag = "h2",
}: SectionHeadingProps) {
  const isDark = variant === "dark";
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.2, rootMargin: "0px 0px -20px 0px" });
  // SSR renders the heading visible so it stays readable without JavaScript
  // (and to crawlers); only after hydration do below-fold headings hide and
  // then animate in.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const hidden = mounted && !inView;
  return (
    <div
      ref={ref}
      data-slot="section-heading"
      style={{ transform: hidden ? "translateY(20px)" : "translateY(0)" }}
      className={cn(
        "flex flex-col gap-4 sm:gap-5 transition-all duration-500 ease-out",
        hidden ? "opacity-0" : "opacity-100",
        align === "center" ? "items-center text-center mx-auto max-w-3xl" : "items-start text-left max-w-3xl",
        className
      )}
    >
      {eyebrow && (
        <span
          style={{ transitionDelay: "100ms", opacity: hidden ? 0 : 1, transform: hidden ? "translateY(10px)" : "translateY(0)" }}
          className={cn(
            "inline-flex items-center gap-2 text-[10.5px] sm:text-xs font-bold uppercase tracking-[0.18em] transition-all duration-500 ease-out",
            isDark ? "text-white" : "text-secondary"
          )}
        >
          <span
            aria-hidden="true"
            className={cn("h-px w-4 sm:w-6", isDark ? "bg-white/40" : "bg-primary/40")}
          />
          {eyebrow}
          <span
            aria-hidden="true"
            className={cn("h-px w-4 sm:w-6", isDark ? "bg-white/40" : "bg-primary/40")}
          />
        </span>
      )}
      <HeadingTag
        style={{ transitionDelay: eyebrow ? "200ms" : "100ms", opacity: hidden ? 0 : 1 }}
        className={cn(
          "text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.02em] text-balance leading-[1.12] sm:leading-[1.08] transition-all duration-500 ease-out",
          isDark
            ? "bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/70"
            : "bg-clip-text text-transparent bg-gradient-to-br from-secondary via-[#0F3D5E] to-primary"
        )}
      >
        {title}
      </HeadingTag>
      {description && (
        <p
          style={{ transitionDelay: eyebrow ? "320ms" : "220ms", opacity: hidden ? 0 : 1 }}
          className={cn(
            "text-[15px] sm:text-lg text-pretty leading-7 sm:leading-relaxed transition-opacity duration-500 ease-out max-w-2xl",
            align === "center" && "mx-auto",
            isDark ? "text-neutral-300" : "text-neutral-600"
          )}
        >
          {description}
        </p>
      )}
      <div
        aria-hidden="true"
        style={{ transitionDelay: eyebrow ? "420ms" : "320ms", opacity: hidden ? 0 : 1 }}
        className={cn(
          "flex items-center gap-1 transition-all duration-700 ease-out",
          align === "center" ? "justify-center mt-1" : "justify-start mt-2"
        )}
      >
        <span className={cn(
          "h-[3px] w-8 rounded-full",
          isDark ? "bg-white/30" : "bg-primary/30"
        )} />
        <span className={cn(
          "h-[3px] w-3 rounded-full",
          isDark ? "bg-white/50" : "bg-primary/60"
        )} />
        <span className={cn(
          "h-[3px] w-12 rounded-full",
          isDark ? "bg-gradient-to-r from-white/40 to-white/10" : "bg-gradient-to-r from-primary to-accent/60"
        )} />
        <span className={cn(
          "h-[3px] w-3 rounded-full",
          isDark ? "bg-white/50" : "bg-primary/60"
        )} />
        <span className={cn(
          "h-[3px] w-8 rounded-full",
          isDark ? "bg-white/30" : "bg-primary/30"
        )} />
      </div>
    </div>
  );
}
