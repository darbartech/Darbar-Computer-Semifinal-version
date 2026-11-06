"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export function useInView<T extends HTMLElement>(
  options: IntersectionObserverInit = { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
) {
  const ref = React.useRef<T | null>(null);
  const [inView, setInView] = React.useState(false);
  const hasTriggered = React.useRef(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasTriggered.current) {
          hasTriggered.current = true;
          setInView(true);
          observer.unobserve(el);
        }
      },
      options
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [options]);

  return { ref, inView };
}

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: React.ElementType;
}

/**
 * `prefers-reduced-motion`, read once and kept live if the setting changes while
 * the page is open. False on the server and on the first client paint, which is
 * the same answer both sides give, so there is nothing to hydrate wrong; the
 * effect corrects it a moment later for anyone who asked for no motion.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
  as = "div",
}: RevealProps) {
  const reduced = usePrefersReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>();
  const [mounted, setMounted] = React.useState(false);
  // Deferred one frame so the hide-on-scroll behaviour only starts after the
  // server-rendered markup has painted (and lint stays happy about sync state).
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const Component = as;

  // Reduced motion means the content is simply there: never hidden, never
  // translated, and with no transition to delay behind it.
  if (reduced) {
    return (
      <Component ref={ref as React.Ref<HTMLDivElement>} className={cn(className)}>
        {children}
      </Component>
    );
  }

  const hidden = mounted && !inView;
  return (
    <Component
      ref={ref as React.Ref<HTMLDivElement>}
      style={{ transitionDelay: `${delay}ms`, transform: hidden ? `translateY(${y}px)` : "translateY(0)" }}
      className={cn(
        "transition-all duration-500 ease-out will-change-transform",
        hidden ? "opacity-0" : "opacity-100",
        className
      )}
    >
      {children}
    </Component>
  );
}
