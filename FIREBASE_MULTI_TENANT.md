# Firebase Multi Tenant Model

This project is being reworked as a multi-tenant portal. The new Firebase project should be isolated from the current raffle system.

## Core Collections

- `users`
  - One document per authenticated user, keyed by Firebase Auth `uid`.
  - Suggested fields: `email`, `displayName`, `role`, `tenantId`, `active`, `createdAt`, `updatedAt`.

- `tenants`
  - One document per customer/company.
  - Suggested fields: `displayName`, `slug`, `status`, `branding`, `createdAt`, `updatedAt`.

- `platform`
  - Global system configuration.
  - Suggested documents: `platform/config`, `platform/domains`, `platform/billing`.

## Tenant Subcollections

Each tenant can contain its own data tree:

- `tenants/{tenantId}/branches`
- `tenants/{tenantId}/raffles`
- `tenants/{tenantId}/participants`
- `tenants/{tenantId}/customers`
- `tenants/{tenantId}/config`
- `tenants/{tenantId}/users`
- `tenants/{tenantId}/audit`

## Roles

- `superadmin`
  - Full access to every tenant and global settings.

- `tenant_admin`
  - Full access inside one tenant.

- `branch_user`
  - Limited operational access inside one tenant.

- `viewer`
  - Read-only access inside one tenant.

## Environment Variables

Copy `.env.example` to `.env` and fill these values from the new Firebase project:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## Bootstrap Order

1. Create the new Firebase project.
2. Enable Email/Password authentication.
3. Create the first `users/{uid}` document for the superadmin.
4. Create the first `tenants/{tenantId}` document.
5. Add branch, raffle, customer and participant data under that tenant.
6. Publish the Firestore rules.
7. Point the new app to the new Firebase environment.
