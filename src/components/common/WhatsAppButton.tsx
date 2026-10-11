"use client";
import * as React from "react";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Client component (docs/04 §4.1): the WhatsApp number and message come from the
 * settings read in `(public)/layout.tsx`, as props.
 */
export type WhatsAppButtonProps = {
  /** `https://wa.me/<digits>` without the `?text=` part. */
  whatsappHref: string;
  /** Already URL-encoded message text. */
  whatsappMessage: string;
  /** Falls back to a generic label when the stored number is still a placeholder. */
  phoneDisplay: string;
};

export function WhatsAppButton({
  whatsappHref,
  whatsappMessage,
  phoneDisplay,
}: WhatsAppButtonProps) {
  const [visible, setVisible] = React.useState(false);
  const [showTooltip, setShowTooltip] = React.useState(false);
  // Must start false to match server HTML; the resize effect syncs the real value on mount.
  const [isMobileViewport, setIsMobileViewport] = React.useState(false);

  React.useEffect(() => {
    let rafId: number | null = null;
    const onResize = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setIsMobileViewport(window.innerWidth < 640);
      });
    };
    onResize();
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, []);

  React.useEffect(() => {
    const threshold = isMobileViewport ? 350 : 200;
    const onScroll = () => setVisible(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isMobileViewport]);

  const waLink = `${whatsappHref}?text=${whatsappMessage}`;

  return (
    <div
      className={cn(
        "fixed z-40 flex flex-col items-end gap-3 pointer-events-none transition-all duration-500 ease-out",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      )}
      // Before the scroll threshold the button is invisible, so it must also stop
      // being a tab stop and a click target — the anchor below re-enables
      // `pointer-events-auto`, which otherwise leaves a live 56px target in the
      // bottom-right corner that the visitor cannot see.
      inert={!visible}
      style={{
        right: "max(1.25rem, env(safe-area-inset-right))",
        bottom: "max(1.25rem, env(safe-area-inset-bottom))",
      }}
    >
      {!isMobileViewport && (
        <div
          className={cn(
            "pointer-events-none absolute bottom-[calc(100%+0.75rem)] right-0 bg-white rounded-2xl shadow-xl shadow-neutral-900/10 border border-neutral-200 px-4 py-3 whitespace-nowrap transition-all duration-200 ease-out origin-bottom-right",
            showTooltip ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none"
          )}
          role="tooltip"
        >
          <p className="text-sm font-semibold text-neutral-900 leading-tight">Chat with us on WhatsApp</p>
          <p className="text-xs text-neutral-500 mt-0.5">{phoneDisplay}</p>
        </div>
      )}

      <a
        href={waLink}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat on WhatsApp"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        className={cn(
          "pointer-events-auto relative flex items-center justify-center rounded-full text-white shadow-xl shadow-[#25D366]/30 transition-all duration-300 ease-out hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#25D366]/30",
          "h-12 w-12 sm:h-14 sm:w-14",
          "bg-[#25D366] hover:bg-[#128C7E]"
        )}
      >
        <span
          className={cn(
            "absolute inset-0 rounded-full animate-ping opacity-30 bg-[#25D366]"
          )}
          aria-hidden="true"
        />
        <MessageCircle className={cn("relative", isMobileViewport ? "size-6" : "size-7")} aria-hidden="true" />
      </a>
    </div>
  );
}
