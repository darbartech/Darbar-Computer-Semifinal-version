import { describe, it, expect } from "vitest";
import { PERMISSIONS, can } from "../src/server/permissions";
import type { Role } from "../src/generated/prisma/client";

const ALL_ROLES: Role[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "EDITOR",
  "COUNSELOR",
  "INSTRUCTOR",
  "ACCOUNTANT",
  "RECEPTION",
  "STUDENT",
];

/**
 * The expected matrix, transcribed from docs/05 §2 (role matrix) and docs/04 §2
 * (permission rules) rather than from `PERMISSIONS` itself. If a permission is
 * granted or revoked, this file has to be edited deliberately — that is the
 * whole point of the test (docs/08 §1 "Authorisation": "Unit test iterates over
 * PERMISSIONS and asserts each role's allowed/denied actions").
 */
const EXPECTED: Record<Role, string[]> = {
  SUPER_ADMIN: [
    "dashboard.view",
    "lead.read",
    "lead.update",
    "lead.export",
    "lead.delete",
    "lead.convert",
    "contact.read",
    "contact.update",
    "student.read",
    "student.create",
    "student.edit",
    "student.approve",
    "student.export",
    "student.erase",
    "enrollment.manage",
    "course.read",
    "course.write",
    "course.archive",
    "batch.read",
    "batch.write",
    "assignment.read",
    "assignment.write",
    "fee.read",
    "fee.write",
    "invoice.issue",
    "invoice.void",
    "payment.record",
    "payment.void",
    "fee.closeDay",
    "fee.reopenDay",
    "report.view",
    "notice.read",
    "notice.write",
    "category.manage",
    "blog.write",
    "events.write",
    "faq.write",
    "gallery.write",
    "testimonials.write",
    "testimonials.delete",
    "team.write",
    "team.delete",
    "media.read",
    "media.upload",
    "media.update",
    "media.delete",
    "settings.read",
    "settings.write",
    "users.read",
    "users.write",
    "user.manage",
    "audit.view",
    "certificate.read",
    "certificate.write",
    "certificate.issue",
    "certificate.revoke",
    "certificate.reissue",
    "certificate.delete",
    "certificate.regenerate_pdf",
    "certificate.signatory.manage",
    "certificate.template.manage",
  ],
  // Admin is everything except the two SUPER_ADMIN-only powers.
  ADMIN: [
    "dashboard.view",
    "lead.read",
    "lead.update",
    "lead.export",
    "lead.convert",
    "contact.read",
    "contact.update",
    "student.read",
    "student.create",
    "student.edit",
    "student.approve",
    "enrollment.manage",
    "course.read",
    "course.write",
    "course.archive",
    "batch.read",
    "batch.write",
    "assignment.read",
    "assignment.write",
    "fee.read",
    "fee.write",
    "invoice.issue",
    "invoice.void",
    "payment.record",
    "payment.void",
    "fee.closeDay",
    "fee.reopenDay",
    "report.view",
    "notice.read",
    "notice.write",
    "category.manage",
    "blog.write",
    "events.write",
    "faq.write",
    "gallery.write",
    "testimonials.write",
    "team.write",
    "media.read",
    "media.upload",
    "media.update",
    "media.delete",
    "settings.read",
    "settings.write",
    "audit.view",
    // Certificates: ADMIN may prepare, issue, delete drafts and re-print, but the
    // destructive lifecycle actions stay SUPER_ADMIN-only (PROMPT_02 §"Conservative
    // RBAC" / PHASE_04 §4).
    "certificate.read",
    "certificate.write",
    "certificate.issue",
    "certificate.delete",
    "certificate.regenerate_pdf",
    "certificate.signatory.manage",
    "certificate.template.manage",
  ],
  // Content editor: dashboard + content writes + media, but no leads, contacts
  // or settings.
  EDITOR: [
    "dashboard.view",
    "course.read",
    "course.write",
    "batch.read",
    "batch.write",
    "assignment.read",
    "assignment.write",
    "notice.read",
    "notice.write",
    "blog.write",
    "events.write",
    "faq.write",
    "gallery.write",
    "testimonials.write",
    "team.write",
    "media.read",
    "media.upload",
    "media.update",
    // Draft authoring only — issuing a certificate publishes it, so it is not an
    // editor capability.
    "certificate.read",
    "certificate.write",
  ],
  // Counselor: leads and contact replies, scoped in the DAL, nothing else.
  COUNSELOR: [
    "dashboard.view",
    "lead.read",
    "lead.update",
    "lead.convert",
    "contact.read",
    "contact.update",
    "student.read",
    "student.create",
    "enrollment.manage",
    "course.read",
  ],
  // Instructor (docs 04 §1): teaching only, and only their own batches — the
  // row-level scope lives in requireBatchAccess, not in this matrix.
  INSTRUCTOR: [
    "dashboard.view",
    "student.read",
    "course.read",
    "batch.read",
    "assignment.read",
    "assignment.write",
  ],
  // Accountant: money and reports. No leads, no students list, no content.
  ACCOUNTANT: [
    "dashboard.view",
    "fee.read",
    "fee.write",
    "invoice.issue",
    "payment.record",
    "fee.closeDay",
    "report.view",
  ],
  // Reception: front desk. Sees leads and admits walk-ins, records a receipt,
  // but never edits fees or approves registrations.
  RECEPTION: [
    "dashboard.view",
    "lead.read",
    "lead.update",
    "lead.convert",
    "student.read",
    "student.create",
    "student.edit",
    "enrollment.manage",
    "course.read",
    "batch.read",
    "fee.read",
    "payment.record",
  ],
  // Student portal accounts have no admin-panel permission at all. Their access
  // is enforced by requireStudent() against their own StudentProfile, not by the
  // staff permission matrix.
  STUDENT: [],
};

/** Actions that must stay admin-only regardless of who is signed in. */
const ADMIN_ONLY = [
  "course.archive",
  "category.manage",
  "settings.read",
  "settings.write",
  "audit.view",
  "media.delete",
  "invoice.void",
  "payment.void",
  // Reopening a counted day is the one move that lets money land in cash already
  // handed over, so it stays with the admins (fix guide §2).
  "fee.reopenDay",
  "certificate.issue",
  "certificate.delete",
  "certificate.regenerate_pdf",
  "certificate.signatory.manage",
  "certificate.template.manage",
] as const;

/** Actions that must stay SUPER_ADMIN only. */
const SUPER_ADMIN_ONLY = [
  "user.manage",
  "lead.delete",
  "certificate.revoke",
  "certificate.reissue",
  // Team members and testimonials have no archive column, so deleting them is
  // irreversible. Both deletes stay here (Task 6).
  "team.delete",
  "testimonials.delete",
  // Brief task 9: handing over a person's whole file, and destroying the identity
  // in it. Neither is a job function any other role has a reason to need.
  "student.export",
  "student.erase",
] as const;

function allowedFor(role: Role): string[] {
  return Object.keys(PERMISSIONS)
    .filter((action) => can(role, action as keyof typeof PERMISSIONS))
    .sort();
}

describe("PERMISSIONS matrix", () => {
  it("grants exactly the expected actions to every role", () => {
    for (const role of ALL_ROLES) {
      expect(allowedFor(role), `matrix drifted for ${role}`).toEqual(
        [...EXPECTED[role]].sort()
      );
    }
  });

  it("denies every action not listed for the role, action by action", () => {
    for (const role of ALL_ROLES) {
      const expected = new Set(EXPECTED[role]);
      for (const action of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
        expect(
          can(role, action),
          `${role} ${can(role, action) ? "should be allowed" : "should be denied"} ${action}`
        ).toBe(expected.has(action));
      }
    }
  });

  it("has no unknown action or role key (catches typos in either table)", () => {
    const actions = new Set(Object.keys(PERMISSIONS));
    for (const role of ALL_ROLES) {
      for (const action of EXPECTED[role]) {
        expect(actions.has(action), `unknown action ${action} in EXPECTED.${role}`).toBe(
          true
        );
      }
    }
    const expectedActions = new Set(
      ALL_ROLES.flatMap((role) => EXPECTED[role])
    );
    for (const action of actions) {
      expect(
        expectedActions.has(action),
        `${action} is in PERMISSIONS but missing from EXPECTED`
      ).toBe(true);
    }
  });

  it("lists at least one role per action and no duplicates", () => {
    for (const [action, roles] of Object.entries(PERMISSIONS)) {
      expect(roles.length, `${action} has no allowed roles`).toBeGreaterThan(0);
      expect(
        new Set(roles).size,
        `${action} repeats a role`
      ).toBe(roles.length);
      for (const role of roles) {
        expect(ALL_ROLES, `${action} grants unknown role ${role}`).toContain(role);
      }
    }
  });

  it("keeps admin-only and SUPER_ADMIN-only actions out of the lower roles", () => {
    for (const action of ADMIN_ONLY) {
      expect(can("SUPER_ADMIN", action)).toBe(true);
      expect(can("ADMIN", action)).toBe(true);
      expect(can("EDITOR", action)).toBe(false);
      expect(can("COUNSELOR", action)).toBe(false);
      expect(can("INSTRUCTOR", action)).toBe(false);
      expect(can("ACCOUNTANT", action)).toBe(false);
      expect(can("RECEPTION", action)).toBe(false);
    }
    for (const action of SUPER_ADMIN_ONLY) {
      expect(can("SUPER_ADMIN", action)).toBe(true);
      expect(can("ADMIN", action)).toBe(false);
      expect(can("EDITOR", action)).toBe(false);
      expect(can("COUNSELOR", action)).toBe(false);
      expect(can("INSTRUCTOR", action)).toBe(false);
      expect(can("ACCOUNTANT", action)).toBe(false);
      expect(can("RECEPTION", action)).toBe(false);
    }
  });

  it("never lets a specialist role cross into another department", () => {
    // docs 09 §2: "INSTRUCTOR has no fee.*, lead.*, settings.*".
    for (const action of [
      "lead.read",
      "lead.update",
      "lead.convert",
      "lead.export",
      "fee.read",
      "fee.write",
      "invoice.issue",
      "invoice.void",
      "payment.record",
      "payment.void",
      "fee.closeDay",
      "fee.reopenDay",
      "report.view",
      "settings.read",
      "settings.write",
      "contact.read",
      "audit.view",
    ] as const) {
      expect(can("INSTRUCTOR", action), `INSTRUCTOR denied ${action}`).toBe(false);
    }
    // Money roles do not touch the CRM or the website.
    for (const action of [
      "lead.read",
      "lead.update",
      "lead.convert",
      "contact.read",
      "course.write",
      "blog.write",
      "settings.write",
      "student.approve",
      "certificate.issue",
    ] as const) {
      expect(can("ACCOUNTANT", action), `ACCOUNTANT denied ${action}`).toBe(false);
    }
    // The accountant may issue a normal bill but never undo money or a bill.
    for (const action of ["invoice.void", "payment.void"] as const) {
      expect(can("ACCOUNTANT", action), `ACCOUNTANT denied ${action}`).toBe(false);
    }
    // Front desk records receipts but cannot edit fees, void them or certify.
    for (const action of [
      "fee.write",
      "invoice.issue",
      "invoice.void",
      "payment.void",
      "fee.closeDay",
      "fee.reopenDay",
      "student.approve",
      "settings.write",
      "users.read",
      "certificate.issue",
      "certificate.revoke",
      "report.view",
    ] as const) {
      expect(can("RECEPTION", action), `RECEPTION denied ${action}`).toBe(false);
    }
  });

  it("never grants a lower role something a higher role lacks", () => {
    // Privilege monotonicity: if COUNSELOR may do X, ADMIN and SUPER_ADMIN may
    // too. A matrix that violates this is almost always a copy/paste mistake.
    for (const [lower, higher] of [
      ["COUNSELOR", "ADMIN"],
      ["EDITOR", "ADMIN"],
      ["INSTRUCTOR", "ADMIN"],
      ["ACCOUNTANT", "ADMIN"],
      ["RECEPTION", "ADMIN"],
      ["ADMIN", "SUPER_ADMIN"],
    ] as const) {
      for (const action of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
        if (can(lower, action)) {
          expect(
            can(higher, action),
            `${lower} has ${action} but ${higher} does not`
          ).toBe(true);
        }
      }
    }
  });

  it("lets SUPER_ADMIN do everything", () => {
    for (const action of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      expect(can("SUPER_ADMIN", action)).toBe(true);
    }
  });

  it("gives COUNSELOR no content-write or settings permission", () => {
    for (const action of [
      "course.write",
      "blog.write",
      "events.write",
      "faq.write",
      "gallery.write",
      "testimonials.write",
      "team.write",
      "media.read",
      "media.upload",
      "media.delete",
      "settings.read",
      "settings.write",
      "lead.export",
    ] as const) {
      expect(can("COUNSELOR", action), `COUNSELOR denied ${action}`).toBe(false);
    }
  });

  it("gives EDITOR no lead, contact or settings permission", () => {
    for (const action of [
      "lead.read",
      "lead.update",
      "lead.export",
      "lead.delete",
      "contact.read",
      "contact.update",
      "settings.read",
      "settings.write",
      "user.manage",
      "audit.view",
    ] as const) {
      expect(can("EDITOR", action), `EDITOR denied ${action}`).toBe(false);
    }
  });
});
