# 08 — RBAC and Security Audit

## Roles

Existing roles:

- SUPER_ADMIN
- ADMIN
- EDITOR
- COUNSELOR

Do not assume the browser role is trustworthy.

## Suggested permission matrix

| Permission | SUPER_ADMIN | ADMIN | EDITOR | COUNSELOR |
|---|---:|---:|---:|---:|
| dashboard.read | yes | yes | yes | yes |
| course.read | yes | yes | yes | yes |
| course.write | yes | yes | yes | no |
| course.publish | yes | yes | no | no |
| content.write | yes | yes | yes | no |
| content.publish | yes | yes | no | no |
| media.upload | yes | yes | yes | no |
| media.delete | yes | yes | no | no |
| lead.read | yes | yes | yes | yes |
| lead.update | yes | yes | yes | yes |
| lead.assign | yes | yes | no | yes |
| settings.write | yes | yes | no | no |
| users.write | yes | no | no | no |
| audit.read | yes | yes | no | no |

Adjust this only if the current product policy requires something different.

## Mandatory server checks

Every mutation must call:

```ts
requirePermission("...")
```

before performing the mutation.

## IDOR protection

For routes like:

```text
/admin/courses/[id]
/admin/leads/[id]
/admin/blog/[id]
```

Never assume a valid ID means the user can modify it.

The server must verify permission and any record-specific access rule.

## Audit

Audit:

- create
- update
- publish
- unpublish
- archive
- delete
- assign
- settings changes
- user/role changes
- media operations

Do not store sensitive form payloads in audit metadata.

## Logging

Never log:

- password
- access token
- refresh token
- full phone/email payload
- inquiry message body
- contact message body

Use IDs and safe summaries.

## CSRF/session

Use the framework/auth mechanism already established by the project. Do not add a second independent session system.

## Input validation

Validate again on the server even if the form validates in React.

Browser validation is UX, not security.
