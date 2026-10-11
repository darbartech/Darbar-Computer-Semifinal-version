# Certificate PDF fonts — licensing

Both families bundled in `files/` are distributed under the **SIL Open Font License 1.1**:

| Family | Weights bundled | License |
| --- | --- | --- |
| Montserrat | Regular (400), Medium (500), SemiBold (600), Bold (700), ExtraBold (800) | SIL OFL 1.1 |
| Cormorant Garamond | Bold (700) | SIL OFL 1.1 |

The OFL was verified by reading the `name` table of each bundled TTF (every file
contains the "SIL Open Font License" and "Copyright" entries).

## Why they are bundled instead of loaded from `certificate-docs/`

The certificate PDF renderer must produce the same typography in production as in
development. `certificate-docs/` and
`DarbarTech_Programmable_Certificate_System_Documentation/` are untracked
reference material that are excluded from `tsc`, ESLint and the build, so a
renderer that reads fonts from there silently falls back to system fonts once the
app is deployed. Tracking the TTFs inside `src/` keeps the print master
reproducible.

## Why this is permitted

The OFL explicitly allows the fonts to be bundled, redistributed and embedded in
documents — including server-side PDF generation — provided the fonts are not
sold on their own and the Reserved Font Names are not reused for modified
versions. The files here are unmodified upstream releases, so no Reserved Font
Name restriction applies.

If a family or weight ever changes, re-download it from its official source
(Google Fonts), re-verify the `name` table as above, and update this file.
