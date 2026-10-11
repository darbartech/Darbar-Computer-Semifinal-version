"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type AccordionContextValue = {
  openItems: Set<string>;
  toggleItem: (value: string) => void;
  type: "single" | "multiple";
};

const AccordionContext = React.createContext<AccordionContextValue | null>(null);

function useAccordionContext(componentName: string) {
  const ctx = React.useContext(AccordionContext);
  if (!ctx) throw new Error(`${componentName} must be used within Accordion`);
  return ctx;
}

interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: "single" | "multiple";
  defaultValue?: string | string[];
}

const Accordion = React.forwardRef<HTMLDivElement, AccordionProps>(
  ({ type = "single", defaultValue, className, children, ...props }, ref) => {
    const [openItems, setOpenItems] = React.useState<Set<string>>(() => {
      if (!defaultValue) return new Set();
      return new Set(Array.isArray(defaultValue) ? defaultValue : [defaultValue]);
    });

    const toggleItem = React.useCallback(
      (value: string) => {
        setOpenItems((prev) => {
          const next = new Set(prev);
          if (next.has(value)) {
            next.delete(value);
          } else {
            if (type === "single") next.clear();
            next.add(value);
          }
          return next;
        });
      },
      [type]
    );

    return (
      <AccordionContext.Provider value={{ openItems, toggleItem, type }}>
        <div ref={ref} data-slot="accordion" className={cn("w-full", className)} {...props}>
          {children}
        </div>
      </AccordionContext.Provider>
    );
  }
);
Accordion.displayName = "Accordion";

interface AccordionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const AccordionItem = React.forwardRef<HTMLDivElement, AccordionItemProps>(
  ({ value, className, children, ...props }, ref) => {
    const { openItems } = useAccordionContext("AccordionItem");
    /** Shared by the trigger and its panel so each can name the other. */
    const sectionId = React.useId();
    return (
      <div
        ref={ref}
        data-slot="accordion-item"
        data-state={openItems.has(value) ? "open" : "closed"}
        className={cn("border-b border-neutral-200 last:border-b-0 first:border-t", className)}
        {...props}
      >
        {React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(
                child as React.ReactElement<{ _itemValue?: string; _sectionId?: string }>,
                { _itemValue: value, _sectionId: sectionId }
              )
            : child
        )}
      </div>
    );
  }
);
AccordionItem.displayName = "AccordionItem";

interface AccordionTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  _itemValue?: string;
  _sectionId?: string;
}

const AccordionTrigger = React.forwardRef<HTMLButtonElement, AccordionTriggerProps>(
  ({ className, children, _itemValue, _sectionId, ...props }, ref) => {
    const ctx = useAccordionContext("AccordionTrigger");
    const isOpen = _itemValue ? ctx.openItems.has(_itemValue) : false;
    return (
      <button
        ref={ref}
        data-slot="accordion-trigger"
        type="button"
        id={_sectionId ? `${_sectionId}-trigger` : undefined}
        aria-expanded={isOpen}
        aria-controls={_sectionId ? `${_sectionId}-panel` : undefined}
        onClick={() => _itemValue && ctx.toggleItem(_itemValue)}
        className={cn(
          "flex flex-1 w-full items-center justify-between py-4 text-left text-sm font-medium transition-all hover:bg-neutral-50 rounded-md px-2 group",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          className
        )}
        {...props}
      >
        <span className="pr-4">{children}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-neutral-500 transition-transform duration-200",
            isOpen ? "rotate-180" : "",
            "group-hover:text-primary"
          )}
          aria-hidden="true"
        />
      </button>
    );
  }
);
AccordionTrigger.displayName = "AccordionTrigger";

interface AccordionContentProps extends React.HTMLAttributes<HTMLDivElement> {
  _itemValue?: string;
  _sectionId?: string;
}

const AccordionContent = React.forwardRef<HTMLDivElement, AccordionContentProps>(
  ({ className, children, _itemValue, _sectionId, ...props }, ref) => {
    const ctx = useAccordionContext("AccordionContent");
    const isOpen = _itemValue ? ctx.openItems.has(_itemValue) : false;
    const contentRef = React.useRef<HTMLDivElement>(null);

    return (
      <div
        ref={ref}
        data-slot="accordion-content"
        data-state={isOpen ? "open" : "closed"}
        id={_sectionId ? `${_sectionId}-panel` : undefined}
        role="region"
        aria-labelledby={_sectionId ? `${_sectionId}-trigger` : undefined}
        // A collapsed panel is only visually hidden — without `inert` its links
        // and buttons would stay in the tab order behind the closed header.
        inert={!isOpen}
        className={cn(
          "overflow-hidden text-sm text-neutral-600 transition-all duration-300 ease-out",
          isOpen ? "max-h-[500px] pb-4 opacity-100" : "max-h-0 opacity-0",
          className
        )}
        aria-hidden={!isOpen}
        {...props}
      >
        <div ref={contentRef} className="px-2 pb-2 leading-relaxed">
          {children}
        </div>
      </div>
    );
  }
);
AccordionContent.displayName = "AccordionContent";

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
