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
  const Component = as;
  return (
    <Component
      ref={ref as React.Ref<HTMLDivElement>}
      style={{ transitionDelay: `${delay}ms`, transform: inView ? "translateY(0)" : `translateY(${y}px)` }}
      className={cn(
        "transition-all duration-500 ease-out will-change-transform opacity-0",
        inView && "opacity-100",
        className
      )}
    >
      {children}
    </Component>
  );
}
