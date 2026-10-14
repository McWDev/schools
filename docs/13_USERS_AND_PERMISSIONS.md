# Users, Roles, and Permissions (decided in Task 003)

## Model
- **Permissions** (`permissions`) are stable codes defined only by migrations, for example `users.invite`. Code checks permissions, never role names. The list lives in `src/server/tenancy/permissions.ts`, and an integration test keeps it in sync with the database.
- **Roles** (`roles`) belong to one school. Six system roles are installed for every school by a database trigger: School administrator, Branch administrator, Teacher, Registrar, Finance officer, and Auditor. They are read-only to the application until custom roles are built.
- **Memberships** link a user to a school with a scope (`school` = all branches, or `branch` = the listed `membership_branches`) and one or more `membership_roles`. Every link uses composite `(school_id, …)` foreign keys, so a role or branch from another school can never be attached.
- **Effective permissions** are resolved on the server into the frozen `TenantContext` on every request (`context.permissions`). Services call `requirePermission(context, code)`.

| Permission | School admin | Branch admin | Teacher | Registrar | Finance | Auditor |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `school.settings.manage` | ✓ | | | | | |
| `branches.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `branches.manage` | ✓ | | | | | |
| `users.read` | ✓ | ✓ | | | | ✓ |
| `users.invite` | ✓ | ✓ | | | | |
| `users.update` | ✓ | ✓ | | | | |
| `users.deactivate` | ✓ | ✓ | | | | |
| `users.assign_roles` | ✓ | ✓ | | | | |
| `audit.read` | ✓ | | | | | ✓ |

Later tasks add their own permissions (students, attendance, fees, and so on) to the catalog and role templates.

## Rules enforced on the server (`src/server/modules/users/`)
1. **Scope visibility.** A school-scoped actor sees every membership of the school. A branch-scoped actor sees only branch-scoped memberships whose branches are *all* inside the actor's branches. A branch admin therefore cannot see or manage a school admin, or someone who also works at another branch. Out-of-scope IDs return "not found".
2. **No escalation.**
   - You can grant only roles whose permissions you already hold.
   - Only school-scoped actors can grant all-branch access.
   - Branch actors can grant only their own branches.
   - You cannot manage someone holding permissions you lack.
3. **No self-service privilege changes.** Nobody can change their own roles, access, or status.
4. **Strict payloads.** Every input schema is `.strict()`, so extra fields such as `permissions`, `schoolId`, or `isPlatformAdmin` cause the request to be rejected.
5. **Re-authentication.** Role changes, access changes, and deactivation require a password entered within the last 10 minutes (`src/server/auth/reauth.ts`).
6. **Shared identities.** Display names are global to an account. A school may rename someone only if that person belongs to no other school.

## Invitations
- An invitation creates the account (status `invited`, no password) plus the membership, roles, and branch access in one transaction. The email is sent after commit.
- The emailed link is `/accept-invitation#token=…`, with the token in the URL fragment only. Only its SHA-256 hash is stored. It expires after 7 days. Re-sending revokes earlier links.
- Accepting a link calls the definer function `app.consume_invitation()`, which consumes the token atomically: single use, unexpired, unrevoked. An invitation never overwrites the password of an account that is already active.
- Inviting an existing active account adds the membership and sends a notice without a password link.

## Deactivation and session rules
| Action | Effect |
|---|---|
| Remove access (membership → `suspended`), and this was their only school | The account becomes `deactivated` and **all sessions are revoked immediately**. |
| Remove access, but they belong to other schools | The membership is suspended. Their next request to this school fails, because tenant context is re-resolved on every request. Sessions pointing at this school drop back to the school picker, and other schools keep working. |
| Restore access | The membership becomes active again. A deactivated account returns to `active` (or `invited` if it never set a password). |

## Profile photos
- **Accepted input:** JPEG, PNG, or WebP, at most 2 MB and 64–6000 px per side, with no animation. The decision is made by **decoding the bytes with `sharp`**, never by trusting the filename or MIME type. SVG, GIF, HTML, and disguised files are rejected.
- **Re-encoding:** every photo is converted to a 512×512 WebP, which drops all metadata (including EXIF GPS) and anything hidden in the original file.
- **Storage:** photos are kept under a server-generated key (`avatars/<userId>/<random>.webp`) in private storage. The local driver writes to `.storage/` and rejects any key outside a strict pattern.
- **Access:** photos are served only through `/api/avatars/[userId]`. The owner can always fetch their own. Others can fetch a photo only with `users.read` and the person inside their scope; everyone else gets 404. Responses carry `nosniff`, `Content-Security-Policy: default-src 'none'`, and private caching.

## Known limitations / follow-ups
- **Production storage.** `STORAGE_DRIVER` defaults to `disabled` in production. A private cloud bucket driver must be added before launch (Task 021).
- **Custom roles.** Roles cannot be edited in the UI yet. The system templates cover the MVP.
- **`users` table.** It still has no RLS (it is a global identity table read during sign-in). All application queries reach users through school-scoped memberships.
- **Malware scanning.** Uploads are not scanned. Re-encoding removes active content, but scanning can be added with the production storage provider.
