import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Task 6 contract (docs/08 §UX). These are the accessibility and progress-state
 * promises that nothing enforces at build time: a `window.confirm()` that walks
 * back in, an admin segment that loses its `loading.tsx`, a failure screen that
 * starts printing `error.stack`, or a layout that drops the skip link all build
 * green and leave a worse page behind.
 *
 * Read from source for the same reason `tests/static-generation.test.ts` does —
 * the regression being guarded is the absence of code, not a wrong value.
 */

const SRC = join(process.cwd(), "src");

function read(...parts: string[]): string {
  const full = join(SRC, ...parts);
  if (!existsSync(full)) throw new Error(`${relative(process.cwd(), full)} is gone`);
  return readFileSync(full, "utf8");
}

/** Every line that is not comment prose (the dialogs explain what they replaced). */
function codeLines(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("*") && !line.startsWith("/*") && !line.startsWith("//"));
}

function tsxFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(tsx|ts)$/.test(entry)) {
        found.push(full);
      }
    }
  };
  walk(root);
  return found;
}

/** Admin segments the brief names as needing a progress state and a failure screen. */
const GATED_ADMIN_SEGMENTS = [
  "leads",
  "students",
  "fees",
  "certificates",
  "messages",
  "users",
  "audit-log",
  "batches",
  "assignments",
];

/** Managers that destroy a row: all of them go through the shared dialog. */
const DESTRUCTIVE_MANAGERS = [
  join("components", "admin", "TeamManager.tsx"),
  join("components", "admin", "TestimonialsManager.tsx"),
  join("components", "admin", "NoticesManager.tsx"),
  join("components", "admin", "BatchesManager.tsx"),
  join("components", "admin", "AssignmentsManager.tsx"),
  join("components", "admin", "certificates", "TemplatesManager.tsx"),
  join("components", "admin", "certificates", "SignatoriesManager.tsx"),
  join("components", "admin", "certificates", "CertificateListTable.tsx"),
];

describe("confirmation dialogs", () => {
  it("leaves no browser confirm() call in the components", () => {
    const offenders = tsxFiles(join(SRC, "components"))
      .filter((file) =>
        codeLines(readFileSync(file, "utf8")).some((line) => /window\.confirm\(/.test(line))
      )
      .map((file) => relative(process.cwd(), file));
    expect(offenders, `${offenders.join(", ")} still uses window.confirm()`).toEqual([]);
  });

  it("builds every destructive ask on the shared dialog", () => {
    for (const file of DESTRUCTIVE_MANAGERS) {
      const source = read(file);
      expect(source, `${file} must import useConfirm`).toContain('from "@/components/common/ConfirmDialog"');
      expect(source, `${file} must call useConfirm()`).toContain("useConfirm()");
      expect(source, `${file} must render the dialog it was given`).toContain("{dialog}");
    }
  });

  it("owns focus, pending state and a required reason", () => {
    const source = read(join("components", "common", "ConfirmDialog.tsx"));
    // one dialog primitive, not a second implementation
    expect(source).toContain('from "@/components/ui/dialog"');
    // Escape closes through the same cancel path as the Cancel button
    expect(source).toContain("onOpenChange");
    expect(source).toContain("onCancel()");
    // Tab stays inside the panel
    expect(source).toContain('event.key !== "Tab"');
    expect(source).toContain("querySelectorAll<HTMLElement>(FOCUSABLE)");
    // the action cannot be double-submitted, and a reason is mandatory when asked for
    expect(source).toContain("disabled={pending || reasonMissing}");
    expect(source).toContain("disabled={pending}");
    // a server refusal stays on screen as an alert, not as a toast that expires
    expect(source).toContain('role="alert"');
  });
});

describe("loading and error states", () => {
  it("gives every gated admin segment both files", () => {
    for (const segment of GATED_ADMIN_SEGMENTS) {
      const dir = join("app", "techdarbar", "(protected)", segment);
      const loading = read(join(dir, "loading.tsx"));
      expect(loading, `${segment}/loading.tsx must show a skeleton`).toContain("SegmentLoading");
      const error = read(join(dir, "error.tsx"));
      expect(error, `${segment}/error.tsx must be a client boundary`).toContain('"use client"');
      expect(error, `${segment}/error.tsx must offer a retry`).toContain("SegmentError");
    }
  });

  it("gives the student portal both files", () => {
    const dir = join("app", "(public)", "student", "(portal)");
    expect(read(join(dir, "loading.tsx"))).toContain("CardsLoading");
    expect(read(join(dir, "error.tsx"))).toContain("SegmentError");
  });

  it("draws skeletons from the shared Skeleton component", () => {
    expect(read(join("components", "admin", "SegmentLoading.tsx"))).toContain(
      'from "@/components/ui/skeleton"'
    );
  });

  it("prints no stack and no raw message on the failure screen", () => {
    const source = read(join("components", "admin", "SegmentError.tsx"));
    expect(source).not.toContain("error.stack");
    // only the digest reaches the page; the message goes to the log
    expect(source).toContain("Reference: {error.digest}");
    expect(source).toContain("onClick={() => reset()}");
  });
});

describe("reduced motion", () => {
  it("overrides the theme animations globally", () => {
    const css = readFileSync(join(SRC, "app", "globals.css"), "utf8");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation-duration: 0.01ms !important");
  });

  it("renders reveal content immediately instead of waiting for the observer", () => {
    const source = read(join("components", "common", "Reveal.tsx"));
    expect(source).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(source).toContain("export function usePrefersReducedMotion");
    // the reduced branch carries no transition, opacity or translate
    const reducedBranch = source.slice(
      source.indexOf("if (reduced)"),
      source.indexOf("const hidden = mounted")
    );
    expect(reducedBranch).not.toContain("transition-all");
    expect(reducedBranch).not.toContain("opacity-0");
    expect(reducedBranch).not.toContain("translateY");
  });
});

describe("keyboard users", () => {
  it("offers a skip link that lands on each area's main region", () => {
    for (const layout of [
      join("app", "(public)", "layout.tsx"),
      join("app", "techdarbar", "(protected)", "layout.tsx"),
      join("app", "verify", "layout.tsx"),
    ]) {
      const source = read(layout);
      expect(source, `${layout} needs a skip link`).toContain('href="#main-content"');
      expect(source, `${layout} needs the link target`).toContain('id="main-content"');
    }
  });

  it("does not bury the skip link behind a second main in the student portal", () => {
    // The portal is a child of the public layout, so that layout's <main> is the
    // target. A <main> here would strand the link on the outer region.
    const file = join("app", "(public)", "student", "(portal)", "layout.tsx");
    expect(read(file)).not.toContain("<main");
  });

  it("keeps a focus ring on the shared controls", () => {
    for (const control of ["button", "input", "textarea", "select"]) {
      const source = read(join("components", "ui", `${control}.tsx`));
      expect(
        /focus-visible:(ring|border)/.test(source),
        `${control}.tsx shows no focus indicator`
      ).toBe(true);
    }
  });
});

describe("the signed-in header chip", () => {
  it("waits for the answer instead of flashing Sign In", () => {
    const source = read(join("components", "layout", "HeaderAccountMenu.tsx"));
    expect(source).toContain("const [resolved, setResolved] = React.useState(false)");
    // a failed lookup resolves too — an endless skeleton is its own bug
    expect(source).toContain("if (!cancelled) setResolved(true)");
    expect(source).toContain("if (!resolved)");
    expect(source.match(/if \(!resolved\)/g)?.length, "both header variants wait").toBe(2);
  });
});
