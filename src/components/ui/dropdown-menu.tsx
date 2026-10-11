"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type DropdownChildElementProps = React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement>;

type DropdownMenuContextValue = {
  open: boolean;
  setOpen: (v: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
};

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenuCtx(name: string) {
  const c = React.useContext(DropdownMenuContext);
  if (!c) throw new Error(`${name} must be inside DropdownMenu`);
  return c;
}

export function DropdownMenu({
  open: controlled,
  defaultOpen,
  onOpenChange,
  children,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [internal, setInternal] = React.useState(defaultOpen ?? false);
  const open = controlled ?? internal;
  const triggerRef = React.useRef<HTMLElement>(null);

  const setOpen = React.useCallback(
    (v: boolean) => {
      if (controlled === undefined) setInternal(v);
      onOpenChange?.(v);
    },
    [controlled, onOpenChange]
  );

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen, triggerRef }}>
      {children}
    </DropdownMenuContext.Provider>
  );
}

export function DropdownMenuTrigger({
  children,
  asChild = false,
}: {
  children: React.ReactElement;
  asChild?: boolean;
}) {
  const { open, setOpen, triggerRef } = useDropdownMenuCtx("DropdownMenuTrigger");

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<DropdownChildElementProps>;
    const props: DropdownChildElementProps = {
      ref: triggerRef as unknown as React.Ref<HTMLElement>,
      "aria-haspopup": "menu",
      "aria-expanded": open,
      onClick: (e: React.MouseEvent<HTMLElement>) => {
        child.props?.onClick?.(e);
        e.stopPropagation();
        setOpen(!open);
      },
    };
    return React.cloneElement(
      child,
      props
    );
  }

  return (
    <span
      ref={triggerRef as unknown as React.RefObject<HTMLSpanElement>}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={(e) => {
        e.stopPropagation();
        setOpen(!open);
      }}
    >
      {children}
    </span>
  );
}

export function DropdownMenuContent({
  className,
  align = "end",
  sideOffset = 8,
  children,
}: {
  className?: string;
  align?: "start" | "end";
  sideOffset?: number;
  children: React.ReactNode;
}) {
  const { open, setOpen, triggerRef } = useDropdownMenuCtx("DropdownMenuContent");
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  React.useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        // Focus goes back where the menu was opened from, not to the page body.
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen, triggerRef]);

  /**
   * The menu is portalled to the end of `<body>`, so tab order never reaches it
   * from the trigger: move focus to the first item as soon as it is on screen.
   */
  React.useEffect(() => {
    if (!open || !mounted) return;
    const raf = window.requestAnimationFrame(() => {
      contentRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')
        ?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open, mounted]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      contentRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step !== 0) {
      event.preventDefault();
      const next =
        current < 0
          ? step > 0
            ? items[0]
            : items[items.length - 1]
          : items[(current + step + items.length) % items.length];
      next?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      (event.key === "Home" ? items[0] : items[items.length - 1])?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  React.useLayoutEffect(() => {
    if (!open) return;
    const triggerEl = triggerRef.current;
    const contentEl = contentRef.current;
    if (!triggerEl || !contentEl) return;

    const update = () => {
      const t = triggerEl.getBoundingClientRect();
      const c = contentEl.getBoundingClientRect();
      const top = t.bottom + sideOffset;
      const rawLeft = align === "end" ? t.right - c.width : t.left;
      const left = Math.min(
        Math.max(8, rawLeft),
        Math.max(8, window.innerWidth - c.width - 8)
      );
      const clampedTop = Math.min(
        Math.max(8, top),
        Math.max(8, window.innerHeight - c.height - 8)
      );
      setPos({ top: clampedTop, left });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, align, sideOffset, triggerRef]);

  if (!open || !mounted) return null;

  const content = (
    <div className="fixed inset-0 z-[95]">
      <div className="absolute inset-0" onMouseDown={() => setOpen(false)} aria-hidden="true" />
      <div
        ref={contentRef}
        role="menu"
        tabIndex={-1}
        onKeyDown={handleMenuKeyDown}
        className={cn(
          "fixed min-w-[12rem] rounded-xl border border-neutral-200 bg-white shadow-lg p-1 outline-none",
          "animate-in fade-in-0 zoom-in-95 duration-150",
          className
        )}
        style={pos ? { top: pos.top, left: pos.left } : undefined}
      >
        {children}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

export function DropdownMenuItem({
  className,
  children,
  onSelect,
  disabled = false,
  asChild = false,
}: {
  className?: string;
  children: React.ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  asChild?: boolean;
}) {
  const { setOpen } = useDropdownMenuCtx("DropdownMenuItem");
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<DropdownChildElementProps>;
    const props: DropdownChildElementProps = {
      role: "menuitem",
      className: cn(
        "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-800",
        "hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none transition-colors duration-150",
        className,
        child.props?.className
      ),
      onClick: (e: React.MouseEvent<HTMLElement>) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        child.props?.onClick?.(e);
        onSelect?.();
        setOpen(false);
      },
    };
    return React.cloneElement(
      child,
      props
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-800",
        "hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none transition-colors duration-150",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      onClick={() => {
        if (disabled) return;
        onSelect?.();
        setOpen(false);
      }}
    >
      {children}
    </button>
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div role="separator" className={cn("-mx-1 my-1 h-px bg-neutral-200", className)} />;
}
