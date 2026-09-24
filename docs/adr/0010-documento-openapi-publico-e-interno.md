# 0010. Documento OpenAPI público e interno: una generación, dos documentos commiteados

- Estado: propuesta
- Fecha: 2026-09-24

## Contexto

ADR-0008 fijó que `openapi/openapi.json` se genera desde el código, se commitea y que los endpoints
internos (health check, webhook de Chatwoot, kill switch) se etiquetan `internal` y quedan **fuera**
del documento público. Lo que no fijó es cuántos documentos existen: si el filtro se aplica al
generar y solo se commitea el público, o si el documento completo también vive en el repositorio.

Esa pregunta no era teórica hasta ahora. La Fase 00b construye el pipeline con el único endpoint que
existe, `GET /health`, y API8 lo excluye del documento público. El resultado es que **el documento
público nace con `paths: {}`** y no tendrá contenido real hasta la Fase 11. El chequeo de deriva que
exige API1 ("el documento commiteado MUST coincidir con el generado") compararía un archivo vacío
contra otro vacío: un paso de CI que no puede fallar hasta dentro de once fases.

Hay además una restricción estructural que se ve venir. `SwaggerModule.createDocument` permite
filtrar por **módulo** (`include`), no por etiqueta. En la Fase 04 el webhook de Chatwoot es interno
pero vive en un módulo que también expondrá endpoints públicos, así que un filtro por módulo deja de
servir exactamente cuando empieza a importar.

## Alternativas

1. **Un solo documento commiteado (el público), filtrado al generarse.** Es el mínimo que exige
   ADR-0008. Costo: el chequeo de deriva no verifica nada hasta la Fase 11, y un cambio en el esquema
   de `/health` no aparece en ningún diff. Un paso verde que no puede ponerse rojo da confianza falsa.
2. **Dos generaciones independientes**, una con todos los módulos y otra con un subconjunto. Costo:
   obliga a que "interno" coincida con una frontera de módulo (se rompe en la Fase 04) y crea dos
   caminos de generación que pueden divergir sin que nadie lo note.
3. **Marcar los internos con `@ApiExcludeEndpoint`.** Costo: los saca de **todos** los documentos. Se
   pierde el documento interno, y con él la única forma de documentar `/health` (que la fila 00b de
   `docs/fases/README.md` pide explícitamente) y de hacer observable hoy el chequeo de deriva.
4. **Una generación y dos documentos derivados, ambos commiteados** (elegida). Costo: un archivo
   generado más en el repositorio y una función pura de filtrado que hay que mantener y probar.

## Decisión

`@nestjs/swagger` genera **un** documento a partir de la aplicación real: el **interno**, que incluye
todo, con los endpoints internos etiquetados `internal`. El documento **público** es el resultado de
una función pura que, sobre ese documento, elimina las operaciones etiquetadas `internal`, los path
items que quedan vacíos, la propia etiqueta `internal` y los esquemas de `components` que dejan de
estar referenciados.

Los dos se commitean y ninguno se edita a mano:

| Archivo | Contenido | Quién lo consume |
|---|---|---|
| `openapi/openapi.json` | documento **público** | Scalar en `/docs`, Spectral, **oasdiff**, cliente de back office (Fase 14) |
| `openapi/openapi.interno.json` | documento **completo** | chequeo de deriva, Spectral, revisión humana del PR |

- El chequeo de deriva compara **los dos**: un cambio en `/health` sin regenerar hace fallar el build.
- **oasdiff compara solo el público**: API10 protege al consumidor del contrato, y un cambio en una
  ruta operativa no es un cambio incompatible de API.
- **Spectral lintea los dos**: el público no ejercita ninguna regla mientras esté vacío.
- La pertenencia al documento público se expresa como **dato** (`tags: ['internal']`), nunca como
  estructura de módulos.

## Consecuencias

- El chequeo de deriva es observable desde el primer commit de la Fase 00b, no desde la Fase 11.
- Las Fases 04 (webhook) y 09 (kill switch) etiquetan `internal` y no tocan nada más: el filtro ya
  existe y ya está probado.
- El repositorio contiene un artefacto generado más. Quien lea el repositorio ve los endpoints
  internos; quien reciba el contrato distribuido, no. Esa asimetría es deliberada: el documento
  interno es documentación del equipo, no del cliente.
- Prohibido: editar cualquiera de los dos documentos a mano; usar `@ApiExcludeEndpoint` para ocultar
  un endpoint del documento público (se usa la etiqueta `internal`); pasar el documento interno a
  Scalar, a oasdiff o al cliente de back office.
- Obligatorio desde ahora: todo endpoint interno nuevo se etiqueta `internal` y su exclusión del
  documento público se verifica con un test, no por inspección.
