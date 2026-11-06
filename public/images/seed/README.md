# Seeded marketing imagery

Every picture here is fixture imagery for `src/content/*` and
`prisma/seed-data/site-settings.ts` — the course cards, gallery, events and blog
covers a fresh database shows before the institute uploads its own photographs
through the media library.

They were downloaded from the stock hosts the seed data used to reference
(Pexels, Unsplash and one Webflow template CDN) and are served from this origin
so that no third-party host has to appear in the Content-Security-Policy
`img-src` list or in `images.remotePatterns` (docs/07 §5, docs/08 §1).

Filenames keep their source (`pexels-<id>.jpg`, `unsplash-<id>.jpg`,
`template-<name>`) so provenance is traceable back to the original photo id.

These are placeholders, not brand assets. Real photography of the campus, the
classrooms and the students belongs in the media library (`/techdarbar/media`),
where it is reviewed, alt-texted and deleted only when unused — and student
photographs must never be committed here at all.
