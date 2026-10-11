# 07 — CRM, Forms and Media Integration

## Existing public forms

The project already has server-side actions for:

- admission inquiry
- contact
- newsletter

Keep these server-side protections:

1. Zod validation
2. honeypot
3. Turnstile
4. rate limit
5. DB write
6. notification
7. cache invalidation

## Course inquiry connection

The inquiry form should submit the course slug, not a client-controlled course title.

Server:

```ts
const course = courseSlug
  ? await findPublishedCourseBySlug(courseSlug)
  : null;
```

Then persist:

- `courseId`
- `courseTitle` snapshot

This is already the correct pattern and should remain.

## Lead management

Admin lead detail should support:

- status
- assignee
- follow-up date
- activity notes
- activity history
- source
- course
- UTM attribution

All status/assignment/follow-up writes must be server-authorized.

## Contact messages

Add an admin list/detail module for `ContactMessage`.

Recommended statuses:

- NEW
- READ
- REPLIED
- ARCHIVED
- SPAM

Do not expose message content in logs.

## Subscribers

Add admin list:

- email
- source
- status
- createdAt
- unsubscribedAt

Do not provide arbitrary bulk email sending unless a dedicated provider/integration is implemented.

## Media

Keep the existing secure Cloudinary flow:

`browser -> signed upload -> Cloudinary -> server verification -> Media row`

The server must verify:

- delivery host
- folder
- MIME/format
- byte size
- upload identity

Never allow a browser to create arbitrary Media rows directly.

## Media usage

Before deleting:

```text
Media
 ├─ Course
 ├─ BlogPost
 ├─ Event
 ├─ GalleryItem
 ├─ Testimonial
 └─ TeamMember
```

If usage > 0, block deletion.

## ImagePicker

All content forms should reuse the existing `ImagePicker`.

Do not create separate upload implementations per module.
