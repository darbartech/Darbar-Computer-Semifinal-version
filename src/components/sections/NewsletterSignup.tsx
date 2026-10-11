"use client";
import * as React from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { newsletterSchema } from "@/lib/validators/newsletter";
import { TURNSTILE_DEV_BYPASS } from "@/lib/validators/shared";
import { subscribeNewsletter } from "@/server/actions/public-forms";
import { cn } from "@/lib/utils";

/** Where the signup came from; stored on the subscriber row. */
export type NewsletterSource = "footer" | "blog" | "home";

export type NewsletterSignupProps = {
  source?: NewsletterSource;
};

export function NewsletterSignup({ source = "footer" }: NewsletterSignupProps) {
  const [email, setEmail] = React.useState("");
  const [website, setWebsite] = React.useState("");
  // No Turnstile widget in the footer: the honeypot plus the server-side rate
  // limit is enough here. When no site key is configured the action skips the
  // check, so the dev token is sent.
  const [turnstileToken] = React.useState(() =>
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? "" : TURNSTILE_DEV_BYPASS
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const { toast } = useToast();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = newsletterSchema.safeParse({
      email,
      source,
      website,
      turnstileToken: turnstileToken || TURNSTILE_DEV_BYPASS,
    });
    if (!parsed.success) {
      toast({
        title: "Please enter a valid email address.",
        variant: "error",
      });
      return;
    }

    setSubmitting(true);
    try {
      const result = await subscribeNewsletter(parsed.data);
      if (!result.ok) {
        toast({ title: result.error, variant: "error" });
        return;
      }
      setEmail("");
      setSuccess(true);
      toast({
        title: result.data.status === "already-subscribed" ? "You're already subscribed" : "Subscribed!",
        description: "Thank you. We'll keep you posted on new courses and events.",
        variant: "success",
      });
      setTimeout(() => setSuccess(false), 5000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-7 lg:p-8">
      <form onSubmit={onSubmit} className="w-full" noValidate>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <Input
              id="newsletter-email"
              type="email"
              placeholder="Email"
              autoComplete="email"
              aria-label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={success ? "newsletter-success" : undefined}
              className="h-12 bg-white/[0.04] border-white/15 text-white placeholder:text-neutral-400 focus:border-primary/70 focus:ring-primary/30 rounded-xl"
            />
            {success && (
              <div
                id="newsletter-success"
                role="status"
                className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-success"
              >
                <CheckCircle2 className="size-5" aria-hidden="true" />
              </div>
            )}
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={submitting}
            className={cn(
              "w-full sm:w-auto sm:min-w-[170px]",
              "bg-primary text-white shadow-lg shadow-primary/25 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30",
              submitting && "opacity-80"
            )}
          >
            {submitting ? (
              "Subscribing..."
            ) : (
              <>
                <Send className="size-4" aria-hidden="true" />
                Subscribe
              </>
            )}
          </Button>
        </div>
        {/* Honeypot: hidden from users, must stay empty. */}
        <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="newsletter-website">Website</label>
          <input
            id="newsletter-website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
      </form>
    </div>
  );
}
