# 11 — Target File/Folder Structure

```text
src/
├── app/
│   ├── admin/
│   │   ├── login/
│   │   └── (protected)/
│   │       ├── page.tsx
│   │       ├── courses/
│   │       ├── batches/
│   │       ├── categories/
│   │       ├── blog/
│   │       ├── events/
│   │       ├── faq/
│   │       ├── gallery/
│   │       ├── testimonials/
│   │       ├── team/
│   │       ├── leads/
│   │       ├── messages/
│   │       ├── subscribers/
│   │       ├── media/
│   │       ├── settings/
│   │       ├── users/
│   │       └── audit/
│   │
│   └── (public)/
│       ├── courses/
│       ├── blog/
│       ├── events/
│       ├── faq/
│       ├── gallery/
│       └── ...
│
├── components/
│   ├── admin/
│   │   ├── BlogTable.tsx
│   │   ├── BlogForm.tsx
│   │   ├── EventTable.tsx
│   │   ├── EventForm.tsx
│   │   ├── FaqManager.tsx
│   │   ├── GalleryManager.tsx
│   │   ├── TestimonialManager.tsx
│   │   ├── TeamManager.tsx
│   │   └── ...
│   └── ...
│
├── lib/
│   └── validators/
│       ├── blog.ts
│       ├── events.ts
│       ├── faq.ts
│       ├── gallery.ts
│       ├── testimonials.ts
│       └── team.ts
│
└── server/
    ├── actions/
    │   ├── blog.ts
    │   ├── events.ts
    │   ├── faq.ts
    │   ├── gallery.ts
    │   ├── testimonials.ts
    │   └── team.ts
    ├── dal/
    │   ├── blog.ts
    │   ├── events.ts
    │   ├── faq.ts
    │   ├── gallery.ts
    │   ├── testimonials.ts
    │   └── team.ts
    ├── services/
    ├── cache.ts
    ├── revalidate.ts
    ├── session.ts
    └── permissions.ts
```

## Dependency direction

```text
Public UI
   ↓
Public DAL
   ↓
Prisma

Admin UI
   ↓
Server Action
   ↓
Permission + Zod
   ↓
DAL/Prisma
   ↓
Audit + Revalidation
```

Never reverse this direction by importing server/database modules into browser components.
