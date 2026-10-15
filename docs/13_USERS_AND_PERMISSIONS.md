# Staff, Roles, and Permissions

## Model
- **Permissions** (`permissions`) are stable codes defined only by migrations, for example `users.invite`. Code checks permissions, never role names. The list in `src/server/access/permissions.ts` is kept in sync with the database by an integration test.
- **Roles** (`roles`): six system roles are installed by migrations: School administrator, Branch administrator, Teacher, Registrar, Finance officer, and Auditor. They are read-only to the application until custom roles are built.
- **Access** belongs to each staff account: `users.access_scope` is `school` (all branches) or `branch` (the branches in `user_branches`), plus one or more `user_roles`.
- **Effective permissions** are resolved on the server into the frozen `AccessContext` on every request (`context.permissions`). Services call `requirePermission(context, code)`.

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
| `academics.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `academics.configure` | ✓ | | | | | |
| `classes.manage` | ✓ | ✓ | | ✓ | | |

Later tasks add their own permissions (students, attendance, fees, and so on) to the catalog and role templates.

## Rules enforced on the server (`src/server/modules/users/`)
1. **Scope visibility.** A school-wide actor sees all staff. A branch-scoped actor sees only branch-scoped staff whose branches are *all* inside the actor's branches. A branch admin therefore cannot see or manage a school admin, or someone who also works at another branch. Out-of-scope IDs return "not found".
2. **No escalation.**
   - You can grant only roles whose permissions you already hold.
   - Only school-wide actors can grant all-branch access.
   - Branch actors can grant only their own branches; RLS enforces this in the database too.
   - You cannot manage someone holding permissions you lack.
3. **No self-service privilege changes.** Nobody can change their own roles, access, or status.
4. **Strict payloads.** Every input schema is `.strict()`, so extra fields such as `permissions`, `status`, or `accessScope` cause the request to be rejected.
5. **Re-authentication.** Role changes, access changes, and deactivation require a password entered within the last 10 minutes (`src/server/auth/reauth.ts`).

## Invitations
- An invitation creates the account (status `invited`, no password) with its roles and branch access in one transaction. The email is sent after commit.
- The emailed link is `/accept-invitation#token=…`, with the token in the URL fragment only. Only its SHA-256 hash is stored. It expires after 7 days. Re-sending revokes earlier links.
- Accepting a link calls the definer function `app.consume_invitation()`, which consumes the token atomically: single use, unexpired, unrevoked. An invitation never overwrites the password of an account that is already active.
- Inviting an email that already has an account is refused.

## Deactivation and session rules
| Action | Effect |
|---|---|
| Remove access | The account becomes `deactivated` and **all sessions are revoked immediately**. History (audit and records they created) is kept. |
| Restore access | The account returns to `active`, or to `invited` if it never set a password. |
| Change branches or roles | Takes effect on the person's next request, because access is re-resolved every time. |

## Profile photos
- **Accepted input:** JPEG, PNG, or WebP, at most 2 MB and 64–6000 px per side, with no animation. The decision is made by **decoding the bytes with `sharp`**, never by trusting the filename or MIME type.
- **Re-encoding:** every photo is converted to a 512×512 WebP, which drops all metadata, including EXIF GPS.
- **Storage:** photos are kept under a server-generated key in private storage. The local driver writes to `.storage/` and rejects any key outside a strict pattern.
- **Access:** photos are served only through `/api/avatars/[userId]`. The owner can always fetch their own. Others can fetch a photo only with `users.read` and the person inside their scope; everyone else gets 404.

## Known limitations / follow-ups
- **Production storage.** `STORAGE_DRIVER` defaults to `disabled` in production. A private cloud bucket driver must be added before launch (Task 021).
- **Custom roles.** Roles cannot be edited in the UI yet.
- **Malware scanning.** Uploads are not scanned. Re-encoding removes active content, but scanning can be added with the production storage provider.
