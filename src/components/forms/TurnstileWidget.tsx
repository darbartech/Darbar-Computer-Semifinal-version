"use client";
import * as React from "react";
import { TURNSTILE_DEV_BYPASS } from "@/lib/validators/shared";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileWidgetProps = {
  /** Called with a fresh token; pass `null` when the token expires. */
  onToken: (token: string) => void;
  siteKey?: string | null;
  theme?: "light" | "dark";
};

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          theme?: "light" | "dark";
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Turnstile script"))
      );
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Turnstile script"));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * Cloudflare Turnstile widget for the public forms (docs/02 §5).
 *
 * When no site key is configured the component emits the development bypass
 * token instead of rendering a widget, so local work is not blocked. The
 * Server Action only accepts that token outside production.
 */
export function TurnstileWidget({
  onToken,
  siteKey,
  theme = "light",
}: TurnstileWidgetProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const widgetIdRef = React.useRef<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const resolvedKey = siteKey ?? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null;

  React.useEffect(() => {
    if (!resolvedKey) {
      onToken(TURNSTILE_DEV_BYPASS);
      return;
    }

    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: resolvedKey,
          theme,
          callback: (token: string) => {
            setError(null);
            onToken(token);
          },
          "expired-callback": () => onToken(TURNSTILE_DEV_BYPASS),
          "error-callback": () => {
            setError("The anti-spam check could not load. Please refresh and try again.");
          },
        });
      })
      .catch(() => {
        setError("The anti-spam check could not load. Please refresh and try again.");
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // `onToken` is intentionally excluded: the parent passes an inline setter
    // and re-running the effect would tear down a solved widget.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedKey, theme]);

  if (!resolvedKey) return null;

  return (
    <div className="space-y-1.5">
      <div ref={containerRef} data-testid="turnstile-widget" />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <p className="text-[11px] text-neutral-500">
        This site is protected by Cloudflare Turnstile.{" "}
        <a
          href="https://www.cloudflare.com/privacypolicy/"
          target="_blank"
          rel="noreferrer noopener"
          className="underline hover:text-neutral-700"
        >
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}
