"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type TabsContextValue = {
  value: string;
  setValue: (v: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);
function useTabsCtx(name: string) {
  const c = React.useContext(TabsContext);
  if (!c) throw new Error(`${name} must be inside Tabs`);
  return c;
}

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue: string;
  value?: string;
  onValueChange?: (v: string) => void;
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ defaultValue, value: controlled, onValueChange, className, children, ...props }, ref) => {
    const [internal, setInternal] = React.useState(defaultValue);
    const value = controlled ?? internal;
    const setValue = React.useCallback(
      (v: string) => {
        if (controlled === undefined) setInternal(v);
        onValueChange?.(v);
      },
      [controlled, onValueChange]
    );
    return (
      <TabsContext.Provider value={{ value, setValue }}>
        <div ref={ref} data-slot="tabs" className={cn("w-full", className)} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    );
  }
);
Tabs.displayName = "Tabs";

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="tablist"
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-lg bg-neutral-100 p-1 text-neutral-600 w-full sm:w-auto",
        className
      )}
      {...props}
    />
  )
);
TabsList.displayName = "TabsList";

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ value, className, children, ...props }, ref) => {
    const ctx = useTabsCtx("TabsTrigger");
    const active = ctx.value === value;
    return (
      <button
        ref={ref}
        role="tab"
        type="button"
        aria-selected={active}
        data-state={active ? "active" : "inactive"}
        onClick={() => ctx.setValue(value)}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          active ? "bg-white text-neutral-900 shadow-sm" : "hover:text-neutral-900",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
TabsTrigger.displayName = "TabsTrigger";

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ value, className, children, ...props }, ref) => {
    const ctx = useTabsCtx("TabsContent");
    const active = ctx.value === value;
    if (!active) return null;
    return (
      <div
        ref={ref}
        role="tabpanel"
        data-slot="tabs-content"
        data-state="active"
        className={cn("mt-6 focus-visible:outline-none", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };
