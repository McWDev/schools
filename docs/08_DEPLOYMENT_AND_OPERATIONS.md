# Deployment and Operations Plan

## Environments
- Local development: test accounts and synthetic data only.
- Staging: production-like configuration and synthetic/masked data.
- Production: restricted access and real school data.

## Deployment checklist
- Configure environment variables in the hosting provider's secret manager.
- Use separate Neon projects/branches or databases for staging and production.
- Enable TLS and production security headers.
- Configure allowed origins, secure cookies, rate limits, and email delivery.
- Apply reviewed migrations as a controlled release step.
- Each school is its own installation with its own database. Run `npm run setup` once to name the school and create its first school administrator; never ship a default password.
- Verify monitoring, error alerts, backups, and restore instructions.
- Test branch isolation and privileged role controls after deployment.
- Verify that production logs do not contain secrets or unnecessary student information.

## Backups and recovery
- Confirm Neon backup/PITR capabilities and retention based on the selected plan.
- Document RPO (acceptable data loss) and RTO (acceptable recovery time) with the product owner.
- Test restoring to an isolated environment at a scheduled interval.
- Restrict access to backups and record restore events.
- Backups do not replace data export or retention policies.

## Operations
- Monitor application errors, latency, database health, failed logins, and unusual authorization denials.
- Keep a dependency update process.
- Define incident severity, escalation, containment, investigation, notification, and recovery procedures.
- Do not expose detailed internal error messages to end users.
- Maintain a release log and rollback plan.
