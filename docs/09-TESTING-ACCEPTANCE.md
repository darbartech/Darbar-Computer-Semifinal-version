# 09 — Testing and Acceptance

## Test categories

### 1. Admin CRUD

For every module:

- create
- edit
- save draft
- publish
- unpublish/archive
- validation error
- unauthorized user

### 2. Public propagation

For each module:

1. Change content in admin.
2. Save.
3. Confirm action returns success.
4. Confirm relevant cache invalidation.
5. Open public page.
6. Confirm updated content appears.
7. Confirm old draft content is not exposed.

## Required E2E scenarios

### Course

```text
admin creates course
-> publish
-> /courses
-> course appears
-> /courses/[slug]
-> detail appears
-> inquiry form can select it
-> inquiry creates Lead with courseId
```

### Blog

```text
admin creates draft
-> public /blog does not show it
-> publish
-> /blog shows it
-> /blog/[slug] works
-> metadata matches
-> sitemap contains slug
```

### Event

```text
admin creates draft
-> not public
-> publish
-> event list/detail show it
-> unpublish
-> public detail returns 404
```

### FAQ

```text
admin changes question/answer/order
-> public FAQ reflects it
```

### Gallery

```text
upload media
-> create gallery item
-> publish
-> gallery displays image
-> deleting referenced media is blocked
```

### Leads

```text
public inquiry
-> Lead NEW
-> admin sees lead
-> assign counselor
-> status change
-> follow-up date
-> activity history
```

## Regression tests

Existing tests should remain green:

- auth
- authorization
- contact spam
- inquiry-to-lead
- course publishing
- mobile smoke

Add tests for every new content domain.

## Acceptance checklist

- [ ] No editable production page imports from `src/content/*`.
- [ ] Every admin mutation validates on server.
- [ ] Every admin mutation checks permission.
- [ ] Every mutation has audit coverage.
- [ ] Every published-content mutation invalidates correct tags.
- [ ] Public pages read DB-backed DAL.
- [ ] Drafts never appear publicly.
- [ ] Sitemap is DB-backed.
- [ ] Metadata is DB-backed.
- [ ] Media deletion checks usage.
- [ ] Existing public design is visually preserved.
- [ ] Existing E2E tests pass.
- [ ] New E2E tests pass.
