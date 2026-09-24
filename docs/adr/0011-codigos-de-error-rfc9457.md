# 0011. Códigos de error estables y forma del cuerpo RFC 9457

- Estado: propuesta
- Fecha: 2026-09-24

## Contexto

ADR-0008 decidió que los errores de la API se devuelven en **RFC 9457**
(`application/problem+json`) con "un código de error propio estable", y `openspec/specs/api/spec.md`
lo formaliza en API4: el código MUST ser distinto del `status` HTTP y el cliente MUST poder
distinguir el tipo de error **sin parsear el mensaje**.

Lo que ninguno de los dos fija es **dónde vive ese código dentro del cuerpo**. RFC 9457 define cinco
miembros (`type`, `title`, `status`, `detail`, `instance`) y permite extensiones. `type` es un URI y
la especificación recomienda —no exige— que resuelva a documentación humana. La decisión no es
cosmética: el nombre y la forma del código son contrato público, los consume el cliente de back
office generado en la Fase 14, y cada fase con endpoints (11, 12, 13, 14) agregará códigos nuevos.
Si no se fija ahora, cada fase inventará el suyo.

Hay además una restricción de privacidad que arrastra el proyecto: `plataforma/config` ya estableció
en la Fase 00a que un error de validación **nombra la variable y el tipo de problema, nunca el valor
recibido** (PLT1), y R14 prohíbe filtrar datos personales. Un cuerpo de error que repita el payload
rechazado rompería las dos cosas a la vez.

## Alternativas

1. **`type` como URL HTTP** (`https://…/errores/validacion-fallida`), siguiendo la recomendación de
   RFC 9457. Costo: el dominio no publica esa página y `/docs` está apagado fuera de desarrollo
   (API9), así que sería una promesa falsa que además ata el contrato a una URL que habría que
   sostener.
2. **Solo `type`, sin miembro propio.** Costo: obliga al cliente a parsear un URI para obtener el
   código, justo lo que API4 quiere evitar.
3. **Solo un miembro de extensión `codigo`, sin `type`.** Costo: se aparta de RFC 9457, que trata
   `type` como el identificador principal del tipo de problema.
4. **Reusar el `status` HTTP como código.** Prohibido explícitamente por API4.
5. **`type` como URN estable + miembro `codigo` con el código desnudo, ambos derivados de una sola
   entrada de catálogo** (elegida). Costo: dos miembros que dicen lo mismo en dos formas.

## Decisión

Toda respuesta de error del sistema se construye desde un **catálogo único** de códigos
(`src/plataforma/errores/catalogo-codigos.ts`), un registro congelado `codigo → { status, title }`
del que se **deriva el tipo TypeScript** de los códigos válidos: un código fuera del catálogo no
compila.

Forma del cuerpo:

```json
{
  "type": "urn:luxeboreal:error:validacion-fallida",
  "title": "La petición no cumple el esquema del endpoint",
  "status": 400,
  "codigo": "validacion-fallida",
  "instance": "/api/v1/ejemplos",
  "errores": [{ "campo": "precio", "problema": "formato" }]
}
```

- `Content-Type: application/problem+json`.
- **`codigo`** es el contrato estable que el cliente compara (API4). `type` es la misma identidad en
  forma de URN, para clientes que sigan RFC 9457 literalmente. Ambos salen de la misma entrada de
  catálogo: no pueden desincronizarse.
- Los códigos se escriben en **kebab-case y en español** (convención de nombres del proyecto):
  `validacion-fallida`, `recurso-no-encontrado`, `conflicto-de-estado`, `error-interno`. Las Fases
  11-13 agregan `peticion-no-autenticada`, `rol-insuficiente` y los de `Idempotency-Key`.
- **Errores de validación**: el miembro de extensión `errores` enumera `{ campo, problema }` con el
  mismo vocabulario que `plataforma/config` (`falta` | `formato` | `valor`) y **MUST NOT** incluir el
  valor recibido (PLT1, R14).
- **Errores no manejados**: `status` 500, `codigo: "error-interno"`, `detail` genérico. El cuerpo
  **MUST NOT** contener el mensaje ni el stack de la excepción; el diagnóstico va al log, nunca a la
  respuesta.
- Un código publicado **no se renombra**: renombrarlo es un cambio incompatible y lo trata API10 como
  tal, igual que quitar un campo.

## Consecuencias

- Un cliente puede ramificar por `codigo` sin leer texto ni depender del `status`.
- Cada fase con endpoints agrega sus códigos en un solo archivo, con el id de su requisito al lado;
  el compilador impide inventarlos sueltos por el código.
- El `type` es un URN, así que el proyecto no queda obligado a publicar y mantener una página por
  código. Si algún día se publica un catálogo web, se agrega como `detail`/documentación sin romper
  el contrato.
- Prohibido desde ahora: devolver un error sin pasar por el catálogo; exponer el valor recibido, el
  mensaje de la excepción o el stack en el cuerpo de la respuesta; usar el `status` HTTP como código
  de error; renombrar un código ya publicado sin tratarlo como cambio incompatible.
