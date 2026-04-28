# Sorteo Multi Tenant Portal

Base nueva del sistema de sorteos pensada como portal multi-tenant.

## Qué incluye

- Portal central de acceso en `/`
- Resolución automática del tenant según la cuenta autenticada
- Workspace por tenant en `/tenant/:tenantId`
- Firebase completamente separado del sistema anterior

## Setup local

1. Copiá `.env.example` a `.env`
2. Completá las variables de Firebase del proyecto nuevo
3. Ejecutá `npm install`
4. Corré `npm run dev`

## Variables de entorno

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`

Las variables `FIREBASE_ADMIN_*` se usan para el panel global cuando el superadmin
necesita resetear accesos desde la app, sin pasar por Firebase Console.

## Modelo de datos

Ver [`FIREBASE_MULTI_TENANT.md`](./FIREBASE_MULTI_TENANT.md) para la estructura de colecciones, roles y orden de bootstrap.

## Rutas

- `/` portal central de acceso
- `/tenant/global` vista global para superadmin
- `/tenant/:tenantId` workspace de una empresa

## Notas

- Este proyecto no comparte base con el sistema anterior.
- El acceso operativo se resuelve por `users/{uid}` y `tenants/{tenantId}`.
- Las convenciones de desarrollo estan en [`CONTRIBUTING.md`](./CONTRIBUTING.md).
