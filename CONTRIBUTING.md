# Contribuir

Guia corta para mantener este proyecto consistente.

## Estilo de codigo

- Usar JavaScript con modulos ES, como el resto del proyecto.
- Mantener nombres de archivos y funciones en `camelCase`.
- Usar componentes React en `PascalCase`.
- Usar constantes compartidas en `SCREAMING_SNAKE_CASE`.
- Preferir imports relativos dentro de `src`.
- Seguir los patrones existentes antes de crear nuevas abstracciones.

## Cambios de UI

- Mantener formularios con labels visibles, feedback cercano al campo y estados deshabilitados claros.
- Cuidar targets tactiles de al menos 44px.
- Probar rutas publicas y privadas cuando un cambio toque auth, tenant o registro por QR.

## Verificacion

Antes de cerrar un cambio, correr:

```bash
npm run build
```

Si se agrega un framework de tests en el futuro, usar archivos `*.test.js` para pruebas unitarias o de integracion.

## Commits

Usar Conventional Commits con una primera linea breve e imperativa:

```text
feat: add tenant raffle filters
fix: improve QR registration validation
docs: document Firebase bootstrap
test: cover password policy rules
```

Prefijos habituales:

- `feat`: funcionalidad nueva
- `fix`: correccion de bug
- `docs`: documentacion
- `test`: pruebas
- `chore`: mantenimiento sin cambio funcional
