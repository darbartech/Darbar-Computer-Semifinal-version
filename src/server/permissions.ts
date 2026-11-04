import type { Role } from "@/generated/prisma/client";

export const PERMISSIONS = {
  "dashboard.view": ["SUPER_ADMIN", "ADMIN", "EDITOR", "COUNSELOR"],
  "lead.read": ["SUPER_ADMIN", "ADMIN", "COUNSELOR"],
  "lead.update": ["SUPER_ADMIN", "ADMIN", "COUNSELOR"],
  "lead.export": ["SUPER_ADMIN", "ADMIN"],
  "lead.delete": ["SUPER_ADMIN"],
  "contact.read": ["SUPER_ADMIN", "ADMIN", "COUNSELOR"],
  "contact.update": ["SUPER_ADMIN", "ADMIN", "COUNSELOR"],
  "student.read": ["SUPER_ADMIN", "ADMIN", "COUNSELOR"],
  "student.approve": ["SUPER_ADMIN", "ADMIN"],
  "course.read": ["SUPER_ADMIN", "ADMIN", "EDITOR", "COUNSELOR"],
  "course.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "course.archive": ["SUPER_ADMIN", "ADMIN"],
  "batch.read": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "batch.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "assignment.read": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "assignment.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "notice.read": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "notice.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "category.manage": ["SUPER_ADMIN", "ADMIN"],
  "blog.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "events.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "faq.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "gallery.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "testimonials.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "team.write": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
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
