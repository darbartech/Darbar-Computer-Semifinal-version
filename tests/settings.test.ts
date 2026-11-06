import { describe, it, expect } from "vitest";
import {
  SETTINGS_KEYS,
  SETTINGS_SCHEMAS,
  SETTINGS_SENSITIVE_FIELDS,
  SETTINGS_TABS,
  SOCIAL_ICON_KEYS,
  WHY_ICON_KEYS,
  aboutSchema,
  contactSchema,
  everyCourseIncludesSchema,
  facilitiesSchema,
  generalSchema,
  heroSchema,
  hoursSchema,
  isPlaceholderText,
  parseSettingsValue,
  retentionSchema,
  socialsSchema,
  statsSchema,
  whyChooseUsSchema,
} from "../src/lib/validators/settings";
import {
  isPlaceholderNumber,
  mapEmbedUrl,
  mapsHref,
  resolveSiteSettings,
  telHref,
  whatsappDigits,
  whatsappMessage,
} from "../src/lib/settings-view";
import {
  PLACEHOLDER_CAMPUS_IMAGE,
  SETTING_DEFAULTS,
} from "../prisma/seed-data/site-settings";

const validGeneral = {
  name: "DarbarTech",
  shortName: "DarbarTech",
  tagline: "GROUP OF TECHNOLOGY",
  description: "Hands-on computer training in Kathmandu.",
  siteUrl: "https://www.darbarcomputer.edu.np",
  logoMediaId: "",
  twitterHandle: "@darbarcomputer",
};

const validContact = {
  phone: "+977-9760808629",
  whatsapp: "+977-9760808629",
  email: "info@darbarcomputer.edu.np",
  address: "Kathmandu, Nepal",
  mapQuery: "Kathmandu, Nepal",
  notifyEmail: "",
};

const validAbout = {
  story: "Founded in Kathmandu and still teaching there.",
  mission: "To make practical training affordable.",
  vision: "To be the most trusted institute in the region.",
  campusMediaId: "",
};

describe("settings key registry", () => {
  it("covers every documented SiteSetting key", () => {
    expect([...SETTINGS_KEYS]).toEqual([
      "general",
      "hero",
      "contact",
      "hours",
      "socials",
      "about",
      "stats",
      "whyChooseUs",
      "facilities",
      "everyCourseIncludes",
      // docs 05 §2: the discount-approval threshold and the receipt footer are
      // configured, not hard-coded.
      "fees",
      // task 9: the windows the `retention` cron job sweeps by.
      "retention",
    ]);
  });

  it("has one schema and one tab per key", () => {
    expect(Object.keys(SETTINGS_SCHEMAS).sort()).toEqual([...SETTINGS_KEYS].sort());
    expect(SETTINGS_TABS.map((tab) => tab.key).sort()).toEqual([...SETTINGS_KEYS].sort());
    for (const key of SETTINGS_KEYS) {
      expect(SETTINGS_SCHEMAS[key]).toBeDefined();
    }
  });

  it("validates the seed baseline for every key", () => {
    for (const key of SETTINGS_KEYS) {
      const parsed = parseSettingsValue(key, SETTING_DEFAULTS[key]);
      expect(parsed.success, `${key} seed baseline must satisfy its schema`).toBe(true);
    }
  });
});

/**
 * Task 9b. These two numbers are the only settings that decide when other
 * people's data disappears, so they are pinned twice over: the windows the
 * brief sets, and the floor that stops a `0` meaning "purge everything".
 */
describe("retentionSchema", () => {
  it("defaults to 24 months of enquiries and 12 of messages", () => {
    expect(SETTING_DEFAULTS.retention).toEqual({ leadMonths: 24, messageMonths: 12 });
    expect(resolveSiteSettings([]).retention).toEqual({ leadMonths: 24, messageMonths: 12 });
  });

  it("coerces the strings an `<input type=\"number\">` posts", () => {
    const parsed = retentionSchema.safeParse({ leadMonths: "18", messageMonths: "6" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual({ leadMonths: 18, messageMonths: 6 });
  });

  it("refuses a window that would sweep the whole table", () => {
    for (const value of [0, -1, 2.5, "0", "", "abc"]) {
      expect(
        retentionSchema.safeParse({ leadMonths: value, messageMonths: 12 }).success,
        `${value} is not a retention window`
      ).toBe(false);
    }
    expect(retentionSchema.safeParse({ leadMonths: 361, messageMonths: 12 }).success).toBe(false);
  });

  it("leaves a missing window to its default instead of failing", () => {
    // An admin who saves the tab with one box cleared posts `""`, which the
    // schema rejects; a row written before this key existed has no field at all.
    expect(retentionSchema.safeParse({ leadMonths: 18 }).data).toEqual({
      leadMonths: 18,
      messageMonths: 12,
    });
  });

  it("asks for a second factor, because shortening one of these deletes data", () => {
    expect(SETTINGS_SENSITIVE_FIELDS.retention).toEqual(["leadMonths", "messageMonths"]);
  });
});

describe("generalSchema", () => {
  it("trims text and strips a trailing slash from the site URL", () => {
    const parsed = generalSchema.safeParse({
      ...validGeneral,
      name: "  DarbarTech  ",
      siteUrl: "https://www.darbarcomputer.edu.np/",
      logoMediaId: "",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.name).toBe("DarbarTech");
    expect(parsed.data.siteUrl).toBe("https://www.darbarcomputer.edu.np");
  });

  it("normalises a blank media id to null", () => {
    const parsed = generalSchema.safeParse({ ...validGeneral, logoMediaId: "" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.logoMediaId).toBeNull();
  });

  it("keeps a cuid-like media id and normalises a missing one", () => {
    const parsed = generalSchema.safeParse({ ...validGeneral, logoMediaId: "ckq1logo123" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.logoMediaId).toBe("ckq1logo123");

    const withoutLogo: Record<string, unknown> = { ...validGeneral };
    delete withoutLogo.logoMediaId;
    const missing = generalSchema.safeParse(withoutLogo);
    expect(missing.success).toBe(true);
    if (!missing.success) return;
    expect(missing.data.logoMediaId).toBeNull();
  });

  it("rejects a non-cuid media id, a relative site URL and a missing name", () => {
    expect(generalSchema.safeParse({ ...validGeneral, logoMediaId: "../../etc/passwd" }).success).toBe(false);
    expect(generalSchema.safeParse({ ...validGeneral, siteUrl: "/courses" }).success).toBe(false);
    expect(generalSchema.safeParse({ ...validGeneral, name: "   " }).success).toBe(false);
  });

  it("lower-cases nothing it should not and keeps an empty twitter handle empty", () => {
    const parsed = generalSchema.safeParse({ ...validGeneral, twitterHandle: "" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.twitterHandle).toBe("");
  });
});

describe("heroSchema", () => {
  const validHero = {
    eyebrow: "37 Career-Focused· **Courses** Certified Trainers.",
    title: "Learn the Digital\nSkills That **Actually**\nGet You Hired.",
    subtitle: "Hands-on training that turns beginners into professionals.",
    primaryCtaLabel: "Browse Courses",
    primaryCtaHref: "/courses",
    secondaryCtaLabel: "",
    secondaryCtaHref: "",
    imageMediaId: "",
    imageAlt: "Trainer guiding students",
    popupMediaId: "",
    popupAlt: "",
  };

  it("accepts an internal path or an absolute URL for a button link", () => {
    expect(heroSchema.safeParse(validHero).success).toBe(true);
    expect(
      heroSchema.safeParse({ ...validHero, primaryCtaHref: "https://example.com/apply" }).success
    ).toBe(true);
  });

  it("rejects a javascript: link and a missing primary label", () => {
    expect(
      heroSchema.safeParse({ ...validHero, primaryCtaHref: "javascript:alert(1)" }).success
    ).toBe(false);
    expect(heroSchema.safeParse({ ...validHero, primaryCtaLabel: "   " }).success).toBe(false);
  });

  it("normalises blank optional fields and media ids to empty/null", () => {
    const parsed = heroSchema.safeParse(validHero);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.secondaryCtaLabel).toBe("");
    expect(parsed.data.secondaryCtaHref).toBe("");
    expect(parsed.data.imageMediaId).toBeNull();
    expect(parsed.data.popupMediaId).toBeNull();
  });
});

describe("contactSchema", () => {
  it("accepts the seeded contact block and lower-cases the notification e-mail", () => {
    const parsed = contactSchema.safeParse({ ...validContact, notifyEmail: " Leads@Example.COM " });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.notifyEmail).toBe("leads@example.com");
  });

  it("rejects an invalid phone, e-mail, notification e-mail or empty address", () => {
    expect(contactSchema.safeParse({ ...validContact, phone: "call-me" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...validContact, email: "not-an-email" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...validContact, notifyEmail: "nope" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...validContact, address: "" }).success).toBe(false);
  });

  it("requires a map query because the embed URL is derived from it", () => {
    expect(contactSchema.safeParse({ ...validContact, mapQuery: "" }).success).toBe(false);
  });

  it("allows a blank notification e-mail (optional field)", () => {
    const parsed = contactSchema.safeParse({ ...validContact, notifyEmail: "" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.notifyEmail).toBe("");
  });
});

describe("hoursSchema and socialsSchema", () => {
  it("keeps free-text day ranges as written", () => {
    const parsed = hoursSchema.safeParse(SETTING_DEFAULTS.hours);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data[0]).toEqual({ day: "Sunday – Friday", time: "7:00 AM – 8:00 PM" });
  });

  it("needs at least one row and both fields filled in", () => {
    expect(hoursSchema.safeParse([]).success).toBe(false);
    expect(hoursSchema.safeParse([{ day: "Sunday", time: "" }]).success).toBe(false);
  });

  it("only accepts known social icons", () => {
    for (const icon of SOCIAL_ICON_KEYS) {
      const parsed = socialsSchema.safeParse([{ name: "Facebook", url: "https://facebook.com/x", icon }]);
      expect(parsed.success, `${icon} should be allowed`).toBe(true);
    }
    expect(
      socialsSchema.safeParse([{ name: "MySpace", url: "https://myspace.com/x", icon: "myspace" }]).success
    ).toBe(false);
  });

  it("rejects a non-http profile URL", () => {
    expect(
      socialsSchema.safeParse([{ name: "Facebook", url: "javascript:alert(1)", icon: "facebook" }]).success
    ).toBe(false);
  });
});

describe("statsSchema (docs/03 §4 publish rule)", () => {
  it("accepts a confirmed figure", () => {
    const parsed = statsSchema.safeParse([{ label: "Students Trained", value: "5,000", isPlaceholder: false }]);
    expect(parsed.success).toBe(true);
  });

  it("rejects an unflagged placeholder value and points at the row", () => {
    const parsed = statsSchema.safeParse([
      { label: "Students Trained", value: "15+", isPlaceholder: false },
      { label: "Partners", value: "TBD", isPlaceholder: false },
    ]);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.path).toEqual([1, "value"]);
    expect(parsed.error.issues[0]?.message).toMatch(/placeholder/i);
  });

  it("accepts the same value when it stays flagged as unverified", () => {
    const parsed = statsSchema.safeParse([{ label: "Partners", value: "TBD", isPlaceholder: true }]);
    expect(parsed.success).toBe(true);
  });

  it("defaults isPlaceholder to false and keeps at least one stat", () => {
    const parsed = statsSchema.safeParse([{ label: "Courses", value: "37" }]);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data[0].isPlaceholder).toBe(false);
    expect(statsSchema.safeParse([]).success).toBe(false);
  });

  it("isPlaceholderText flags the seeded marker words only", () => {
    expect(isPlaceholderText("PLACEHOLDER")).toBe(true);
    expect(isPlaceholderText("tbd")).toBe(true);
    expect(isPlaceholderText("To be confirmed")).toBe(true);
    expect(isPlaceholderText("10+")).toBe(false);
  });
});

describe("aboutSchema, whyChooseUsSchema and the string lists", () => {
  it("requires story, mission and vision", () => {
    expect(aboutSchema.safeParse({ ...validAbout, mission: "" }).success).toBe(false);
    expect(aboutSchema.safeParse(SETTING_DEFAULTS.about).success).toBe(true);
  });

  it("only accepts known highlight icons", () => {
    for (const icon of WHY_ICON_KEYS) {
      const parsed = whyChooseUsSchema.safeParse([{ title: "Title", description: "Body", icon }]);
      expect(parsed.success, `${icon} should be allowed`).toBe(true);
    }
    expect(whyChooseUsSchema.safeParse([{ title: "T", description: "B", icon: "rocket" }]).success).toBe(false);
  });

  it("parses one-per-line textareas into trimmed, de-duplicated arrays", () => {
    const parsed = facilitiesSchema.safeParse(" Computer labs \n Wi-Fi\n\nComputer labs \n");
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual(["Computer labs", "Wi-Fi"]);
  });

  it("rejects an empty list, an over-long entry and an over-long list", () => {
    expect(everyCourseIncludesSchema.safeParse("   \n  ").success).toBe(false);
    expect(everyCourseIncludesSchema.safeParse("x".repeat(121)).success).toBe(false);
    const tooMany = Array.from({ length: 31 }, (_, i) => `Benefit ${i}`);
    expect(everyCourseIncludesSchema.safeParse(tooMany).success).toBe(false);
  });
});

describe("settings URL helpers", () => {
  it("builds a tel: href from a formatted phone number", () => {
    expect(telHref("+977-9760808629")).toBe("tel:+9779760808629");
  });

  it("strips the plus sign for wa.me and falls back to the phone", () => {
    expect(whatsappDigits("+977-9760808629", "")).toBe("9779760808629");
    expect(whatsappDigits("", "+977-9800000000")).toBe("9779800000000");
  });

  it("builds map search and embed URLs from the place query", () => {
    expect(mapsHref("Kathmandu, Nepal")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Kathmandu%2C%20Nepal"
    );
    expect(mapEmbedUrl("Kathmandu, Nepal")).toBe(
      "https://www.google.com/maps?q=Kathmandu%2C%20Nepal&output=embed"
    );
  });

  it("never returns embed markup, so the contact page cannot inject stored HTML", () => {
    const url = mapEmbedUrl("<script>alert(1)</script>");
    expect(url.startsWith("https://www.google.com/maps?q=")).toBe(true);
    expect(url).not.toContain("<script>");
    expect(url).toContain("%3Cscript%3E");
  });

  it("mirrors the old WhatsApp copy and detects a placeholder number", () => {
    expect(whatsappMessage("DarbarTech")).toBe(
      "Hi DarbarTech! I'm interested in learning more about your courses. Can you help me?"
    );
    expect(isPlaceholderNumber("PLACEHOLDER")).toBe(true);
    expect(isPlaceholderNumber("+977-9760808629")).toBe(false);
  });
});

describe("resolveSiteSettings layering (docs/07 §1)", () => {
  it("returns the seed defaults when the database has no rows", () => {
    const view = resolveSiteSettings([], {}, {});
    expect(view.general.name).toBe(SETTING_DEFAULTS.general.name);
    expect(view.contact.email).toBe(SETTING_DEFAULTS.contact.email);
    expect(view.hours).toEqual(SETTING_DEFAULTS.hours);
    expect(view.about.campusImageUrl).toBe(PLACEHOLDER_CAMPUS_IMAGE);
    expect(view.general.logoUrl).toBeNull();
  });

  it("uses NEXT_PUBLIC_* variables as fallbacks while no row exists", () => {
    const view = resolveSiteSettings([], {}, {
      NEXT_PUBLIC_SITE_URL: "https://env.example.com",
      NEXT_PUBLIC_CONTACT_PHONE: "+977-9800000000",
      NEXT_PUBLIC_CONTACT_EMAIL: "env@example.com",
    });
    expect(view.general.siteUrl).toBe("https://env.example.com");
    expect(view.contact.phone).toBe("+977-9800000000");
    expect(view.contact.email).toBe("env@example.com");
    expect(view.contact.address).toBe(SETTING_DEFAULTS.contact.address);
  });

  it("lets a stored row win over the environment", () => {
    const view = resolveSiteSettings(
      [{ key: "contact", value: { ...validContact, email: "db@example.com" } }],
      {},
      { NEXT_PUBLIC_CONTACT_EMAIL: "env@example.com" }
    );
    expect(view.contact.email).toBe("db@example.com");
  });

  it("ignores an invalid row, reports it and falls back", () => {
    const invalidKeys: string[] = [];
    const view = resolveSiteSettings(
      [{ key: "contact", value: { ...validContact, email: "broken" } }],
      {},
      {},
      SETTING_DEFAULTS,
      (key) => invalidKeys.push(key)
    );
    expect(invalidKeys).toEqual(["contact"]);
    expect(view.contact.email).toBe(SETTING_DEFAULTS.contact.email);
  });

  it("falls back to the environment when the stored row is invalid", () => {
    const view = resolveSiteSettings(
      [{ key: "contact", value: { phone: 1 } }],
      {},
      { NEXT_PUBLIC_CONTACT_EMAIL: "env@example.com" }
    );
    expect(view.contact.email).toBe("env@example.com");
  });

  it("resolves the logo and campus images through the media map", () => {
    const view = resolveSiteSettings(
      [
        { key: "general", value: { ...validGeneral, logoMediaId: "ckqlogo" } },
        { key: "about", value: { ...validAbout, campusMediaId: "ckqcampus" } },
      ],
      { ckqlogo: "https://cdn.example.com/logo.png", ckqcampus: "https://cdn.example.com/campus.jpg" }
    );
    expect(view.general.logoUrl).toBe("https://cdn.example.com/logo.png");
    expect(view.about.campusImageUrl).toBe("https://cdn.example.com/campus.jpg");
  });

  it("keeps the stock campus photo when the media id cannot be resolved", () => {
    const view = resolveSiteSettings([{ key: "about", value: { ...validAbout, campusMediaId: "ckqmissing" } }], {});
    expect(view.about.campusImageUrl).toBe(PLACEHOLDER_CAMPUS_IMAGE);
  });

  it("derives the contact links used by the header, footer and WhatsApp button", () => {
    const view = resolveSiteSettings([]);
    expect(view.contact.telHref).toBe("tel:+9779760808629");
    expect(view.contact.mailHref).toBe("mailto:info@darbarcomputer.edu.np");
    expect(view.contact.whatsappHref).toBe("https://wa.me/9779760808629");
    expect(view.contact.whatsappDisplay).toBe(SETTING_DEFAULTS.contact.whatsapp);
    expect(view.contact.whatsappMessage).toContain(SETTING_DEFAULTS.general.name);
  });

  it("never publishes a placeholder WhatsApp number: such a row is invalid, so the fallback wins", () => {
    const invalidKeys: string[] = [];
    const view = resolveSiteSettings(
      [{ key: "contact", value: { ...validContact, whatsapp: "PLACEHOLDER" } }],
      {},
      {},
      SETTING_DEFAULTS,
      (key) => invalidKeys.push(key)
    );
    expect(invalidKeys).toEqual(["contact"]);
    expect(view.contact.whatsappDisplay).toBe(SETTING_DEFAULTS.contact.whatsapp);
    expect(view.contact.whatsappDisplay).not.toMatch(/placeholder/i);
  });

  it("keeps the placeholder flag on seeded stats so the public marker still renders", () => {
    const view = resolveSiteSettings([{ key: "stats", value: SETTING_DEFAULTS.stats }]);
    expect(view.stats.filter((stat) => stat.isPlaceholder).length).toBe(3);
    expect(view.stats.find((stat) => stat.label === "Courses Offered")?.isPlaceholder).toBe(false);
  });
});
