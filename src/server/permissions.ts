import type { Role } from "@/generated/prisma/client";

export const PERMISSIONS = {
  "dashboard.view": [
    "SUPER_ADMIN",
    "ADMIN",
    "EDITOR",
    "COUNSELOR",
    "INSTRUCTOR",
    "ACCOUNTANT",
    "RECEPTION",
  ],
  "lead.read": ["SUPER_ADMIN", "ADMIN", "COUNSELOR", "RECEPTION"],
  "lead.update": ["SUPER_ADMIN", "ADMIN", "COUNSELOR", "RECEPTION"],
  "lead.export": ["SUPER_ADMIN", "ADMIN"],
  "lead.delete": ["SUPER_ADMIN"],
  "lead.convert": ["SUPER_ADMIN", "ADMIN", "RECEPTION", "COUNSELOR"],
  "contact.read": ["SUPER_ADMIN", "ADMIN", "COUNSELOR"],
  "contact.update": ["SUPER_ADMIN", "ADMIN", "COUNSELOR"],
  "student.read": ["SUPER_ADMIN", "ADMIN", "COUNSELOR", "RECEPTION", "INSTRUCTOR"],
  "student.create": ["SUPER_ADMIN", "ADMIN", "RECEPTION", "COUNSELOR"],
  "student.edit": ["SUPER_ADMIN", "ADMIN", "RECEPTION"],
  "student.approve": ["SUPER_ADMIN", "ADMIN"],
  /**
   * Brief task 9: the two data-request powers. `student.read` is a job — a
   * counselor, a teacher, a front desk — and each of them sees only the slice the
   * job needs. Pulling a person's whole file out of the institute, or destroying
   * the identity in it, is neither of those jobs, so both stay with the one role
   * that answers for the database.
   */
  "student.export": ["SUPER_ADMIN"],
  "student.erase": ["SUPER_ADMIN"],
  "enrollment.manage": ["SUPER_ADMIN", "ADMIN", "RECEPTION", "COUNSELOR"],
  "course.read": ["SUPER_ADMIN", "ADMIN", "EDITOR", "COUNSELOR", "RECEPTION", "INSTRUCTOR"],
  "course.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "course.archive": ["SUPER_ADMIN", "ADMIN"],
  "batch.read": ["SUPER_ADMIN", "ADMIN", "EDITOR", "INSTRUCTOR", "RECEPTION"],
  "batch.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "assignment.read": ["SUPER_ADMIN", "ADMIN", "EDITOR", "INSTRUCTOR"],
  "assignment.write": ["SUPER_ADMIN", "ADMIN", "EDITOR", "INSTRUCTOR"],
  // `attendance.*` and `exam.write` used to sit here. Nothing read them: the
  // schema has no Attendance or Exam model and no page or action asked for the
  // permission, so the matrix was claiming powers the panel cannot grant. They
  // come back with the attendance and exam screens, when there is something
  // behind them to guard.
  "fee.read": ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT", "RECEPTION"],
  "fee.write": ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"],
  /**
   * docs 05 §2: preparing a bill and making it a bill are different jobs. An
   * ACCOUNTANT may issue a normal invoice; a discount over the Settings threshold
   * is refused unless the caller is ADMIN (checked in the action, not here).
   */
  "invoice.issue": ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"],
  "invoice.void": ["SUPER_ADMIN", "ADMIN"],
  "payment.record": ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT", "RECEPTION"],
  "payment.void": ["SUPER_ADMIN", "ADMIN"],
  /**
   * Fix guide §2: counting the drawer and shutting a day is the accountant's job,
   * undoing a closed day is not — once reopened, receipts can land in money that
   * has already been handed over.
   */
  "fee.closeDay": ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"],
  "fee.reopenDay": ["SUPER_ADMIN", "ADMIN"],
  "report.view": ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"],
  "notice.read": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "notice.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "category.manage": ["SUPER_ADMIN", "ADMIN"],
  "blog.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "events.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "faq.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "gallery.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "testimonials.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  /**
   * Task 6: neither row has an archive flag in the schema, so deleting one is the
   * irreversible kind. Editing and unpublishing stay with the content roles; the
   * hard delete belongs to SUPER_ADMIN, the same way `lead.delete` does.
   */
  "testimonials.delete": ["SUPER_ADMIN"],
  "team.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "team.delete": ["SUPER_ADMIN"],
  "media.read": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "media.upload": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "media.update": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "media.delete": ["SUPER_ADMIN", "ADMIN"],
  "settings.read": ["SUPER_ADMIN", "ADMIN"],
  "settings.write": ["SUPER_ADMIN", "ADMIN"],
  "users.read": ["SUPER_ADMIN"],
  "users.write": ["SUPER_ADMIN"],
  "user.manage": ["SUPER_ADMIN"],
  "audit.view": ["SUPER_ADMIN", "ADMIN"],
  "certificate.read": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "certificate.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "certificate.issue": ["SUPER_ADMIN", "ADMIN"],
  "certificate.revoke": ["SUPER_ADMIN"],
  "certificate.reissue": ["SUPER_ADMIN"],
  "certificate.delete": ["SUPER_ADMIN", "ADMIN"],
  "certificate.regenerate_pdf": ["SUPER_ADMIN", "ADMIN"],
  "certificate.signatory.manage": ["SUPER_ADMIN", "ADMIN"],
  "certificate.template.manage": ["SUPER_ADMIN", "ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type PermissionAction = keyof typeof PERMISSIONS;

export function can(role: Role, action: PermissionAction): boolean {
  return (PERMISSIONS[action] as readonly Role[]).includes(role);
}
