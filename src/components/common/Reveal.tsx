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

export function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
  as = "div",
}: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [mounted, setMounted] = React.useState(false);
  // Deferred one frame so the hide-on-scroll behaviour only starts after the
  // server-rendered markup has painted (and lint stays happy about sync state).
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const hidden = mounted && !inView;
  const Component = as;
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
