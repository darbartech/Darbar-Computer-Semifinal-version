# 03 — Admin Modules

## Shared admin architecture

Every module follows:

`Admin Page -> Server read -> Client form/table -> Server Action -> DAL -> DB -> Audit -> Revalidate`

## Module matrix

| Module | DB | List | Create/Edit | Publish | Delete/Archive |
|---|---|---|---|---|---|
| Courses | Course | Yes | Yes | Yes | Archive |
| Batches | Batch | Add | Add | Status | Cancel |
| Categories | Category/Group | Yes | Yes | Active | Soft disable |
| Blog | BlogPost/Tag | Add | Add | Yes | Archive |
| Events | Event | Add | Add | Yes | Cancel |
| FAQ | Faq/FaqCategory | Add | Add | Yes | Delete |
| Gallery | GalleryItem | Add | Add | Yes | Remove |
| Testimonials | Testimonial | Add | Add | Yes | Hide |
| Team | TeamMember | Add | Add | Yes | Hide |
| Leads | Lead | Existing | Existing | Status | Spam/archive |
| Messages | ContactMessage | Add | Status | N/A | Archive |
| Subscribers | Subscriber | Add | Status | N/A | Unsubscribe |
| Media | Media | Existing | Alt | N/A | Delete if unused |
| Settings | SiteSetting | Existing | Existing | Immediate | N/A |
| Users | User | Add | Role/status | N/A | Deactivate |
| Audit | AuditLog | Add | Read-only | N/A | No |

## Standard route pattern

For example:

```text
src/app/admin/(protected)/blog/
  page.tsx
  new/page.tsx
  [id]/page.tsx
```

Client components:

```text
src/components/admin/
  BlogTable.tsx
  BlogForm.tsx
  BlogStatusBadge.tsx
```

Server:

```text
src/server/dal/blog.ts
src/server/actions/blog.ts
```

Validators:

```text
src/lib/validators/blog.ts
```

## Blog form

Fields:

- title
- slug
- excerpt
- content
- cover image
- author
- tags
- reading time
- SEO title
- SEO description
- status
- publishedAt

Behavior:

- Auto-generate slug from title only when slug has not been manually edited.
- Preserve manually edited slug.
- Draft does not appear publicly.
- Publish sets `publishedAt` if empty.
- Changing a published slug invalidates both old and new route cache.
- Show preview link only when published.

## Event form

Fields:

- title
- slug
- category
- startsAt
- endsAt
- location
- short description
- full description
- cover
- registration URL
- capacity
- status

Validation must reject:
- invalid dates
- end before start
- invalid URL
- negative capacity

## FAQ

Admin should support:

- category ordering
- FAQ ordering
- publish toggle
- question/answer editing
- drag/drop ordering only if implementation remains deterministic

Persist explicit `sortOrder`.

## Gallery

Use the existing Media library.

Do not duplicate uploaded files.

A GalleryItem references a Media row.

Admin flow:

1. Select existing media.
2. Set title/alt/category.
3. Set publish state.
4. Set sort order.
5. Save GalleryItem.

## Testimonials

Fields:

- name
- course
- quote/content
- optional image if supported by current model
- display order
- published/hidden

## Team

Fields should map exactly to the existing `TeamMember` Prisma model. Do not invent fields that are not in the schema.

## Batches

Course admin should expose related batches:

- batch name
- course
- start date
- time slot
- total seats
- seats taken
- status

Seats must never be changed blindly from the browser. Server validation must enforce:

`0 <= seatsTaken <= seatsTotal`

## Admin UX rule

Do not rebuild existing admin components. Reuse:

- `AdminSidebar`
- `AdminTopbar`
- existing UI primitives
- `ImagePicker`
- `StatusBadges`
- existing form/table patterns
