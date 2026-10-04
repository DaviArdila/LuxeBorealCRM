# Proposal: Fase 11b — Cliente Angular: estilo del bot y mensajes fijos

- Change: `fase-11b-cliente-angular` · Fase de la hoja de ruta: **11b** · Rama: `fase-11b-cliente-angular`
- Fecha: 2026-10-03 · Estado: **spec en revisión** (pendiente de aprobación del dueño)
- Depende de: **11a cerrada** (sesión, guardias y roles).
- ADR: [0022](../../../docs/adr/0022-cliente-angular-en-el-repo.md) (cliente Angular en `cliente/`, `propuesta`).

## Intent

El dueño quiere ajustar cómo habla el bot desde una pantalla, sin línea de comandos ni despliegues. Hoy el estilo se
cambia con `npm run prompt:estilo` (Fase 08c) y los textos fijos del bot (pedir texto en vez de audio, traspaso a un
asesor, fuera de cobertura, etc.) solo se cambian escribiendo a mano en la tabla `parametro`, que además está vacía:
rigen los textos de respaldo del código y nadie los ve.

Esta fase crea el cliente de back office en `cliente/` (Angular + PrimeNG, ADR-0022) con tres pantallas: **inicio de
sesión**, **Estilo del bot** (ver, editar, publicar, historial, restaurar) y **Mensajes fijos** (lista cerrada de
textos con su descripción, editar y guardar). Del lado del servidor agrega los endpoints de admin que esas pantallas
usan, reutilizando los casos de uso del estilo, y una semilla idempotente de los mensajes fijos.

Éxito: el dueño inicia sesión en `http://localhost:4200`, publica un estilo y edita `mensaje_handoff`, y el siguiente
mensaje del bot usa los dos sin reiniciar nada; un asesor no ve esas pantallas y el servidor lo rechaza si lo intenta.

## Decisiones ya tomadas (no se reabren)

| Tema | Decisión | Dónde |
|---|---|---|
| Tecnología del cliente | Angular (versión estable más reciente) con PrimeNG | Dueño, 2026-10-03; ADR-0022 |
| Dónde vive | En este repo, en `cliente/`, con su propio `package.json` | Dueño, 2026-10-03; ADR-0022 (enmienda el doc 06) |
| Autenticación | Cookie de sesión de la 11a, mismo origen | ADR-0021 |
| Qué se edita del prompt | Solo el estilo; las reglas no negociables siguen en código | ADR-0020 |
| Dónde corre | Solo en local hasta la 09b (VPS) | Dueño, 2026-10-03 |

## Scope

### In Scope

1. `cliente/`: Angular estable (standalone, signals, zoneless; la versión exacta la fija T1), PrimeNG, lint, tests y
   build propios.
2. Cliente HTTP generado con `ng-openapi-gen` desde `openapi/openapi.json` (`npm run cliente:generar`) y verificación
   de deriva en CI.
3. `proxy.conf.json` de desarrollo hacia la API local: mismo origen, la cookie funciona sin CORS.
4. Pantalla de inicio de sesión y guardia de rutas que solo refleja `GET /api/v1/auth/yo`.
5. Pantalla **Estilo del bot** y sus endpoints de admin en `agente`, sobre `PublicarEstilo`, `RestaurarEstilo`,
   `ListarHistorialEstilo` y `ProveedorEstilo`.
6. Pantalla **Mensajes fijos** y sus endpoints de admin, con una lista cerrada de claves de `parametro`.
7. Semilla idempotente de los mensajes fijos con los textos de respaldo actuales (`npm run mensajes:sembrar`).
8. `npm run ci` ampliado con lint, tests, build, auditoría y deriva del cliente.

### Out of Scope

| Qué | Dónde | Motivo |
|---|---|---|
| Servir el cliente en producción (mismo dominio) | 09b (P55) | Sin VPS no hay dominio; hasta entonces el cliente corre en local |
| Bot configurable: perfil, escenarios con pasos, ejemplos, categorías del menú | Fase 11c | Exige su propio ADR de esquema |
| Pantalla de usuarios | Posterior (P52) | En 11a los usuarios se crean por comando |
| Inventario, ventas, importación por archivo | 12-14 | Siguen después del corte (P8) |
| Pruebas de navegador de punta a punta (Playwright) | Posterior | El recorrido se prueba con tests de componentes y una verificación `[manual]` |
| Vista previa del estilo con una conversación simulada | 11c o posterior | Las evals reales siguen siendo la prueba (EVL3) |
| Dashboard App dentro de Chatwoot | Posterior (P14) | El mismo cliente se podrá embeber |

## Qué se migra del prototipo

| Prototipo | Decisión | Motivo |
|---|---|---|
| `panel/` (retirado, ADR-006 del prototipo) | descartar | Se reemplaza por este cliente; de su experiencia solo se recupera la idea de una pantalla por tabla (doc 06) |
| Textos de `parametros.csv` del prototipo | conservar (ya migrados) | Son los textos de respaldo actuales (P31); la semilla los lleva a la base sin cambiarlos |

Ningún test del prototipo se reemplaza.

## Preguntas abiertas

Registradas en `docs/PREGUNTAS_ABIERTAS.md` como P55 (Q1) a P58 (Q4). Ninguna bloquea: cada una tiene una
recomendación aplicada como defecto.

| Id | Pregunta | Recomendación aplicada |
|---|---|---|
| **Q1** (P55) | ¿Cómo se sirve el cliente en producción, bajo el mismo dominio? | Se decide en la 09b; candidatas: Nest sirve los estáticos o el proxy inverso enruta `/api` y `/` |
| **Q2** (P56) | ¿Qué valida un mensaje fijo? | No vacío, hasta 1.000 caracteres, sin valores en pesos (R2) y sin marcadores `{{...}}` |
| **Q3** (P57) | ¿`aviso_datos` (aviso de asistente automatizado, R14) se edita libremente? | Sí, con una advertencia en su descripción; la validación solo exige que no quede vacío |
| **Q4** (P58) | ¿El asesor ve las pantallas de estilo y mensajes fijos? | No: solo `admin` en esta fase; el menú las oculta y el servidor responde `403` |

## Risks

| Riesgo | Efecto | Mitigación |
|---|---|---|
| `ng-openapi-gen` no maneja OpenAPI 3.1 | No se puede generar el cliente | T1 lo verifica con el `openapi.json` real; alternativa anotada (`@hey-api/openapi-ts` u `openapi-generator`) |
| Un estilo malo publicado desde la pantalla llega a los clientes | El bot responde mal | Igual que con el comando (ADR-0020): validación, historial y restaurar; la pantalla recuerda correr las evals reales antes de exponerlo (EVL3) |
| Un mensaje fijo mal escrito (p. ej. `aviso_datos` vacío o sin el aviso) | Se rompe R14 o el tono | Validación (Q2), descripción con advertencia (Q3) y semilla que nunca pisa un texto editado |
| Dos `package.json` y dos `node_modules` | CI más lenta, auditoría doble | El cliente corre en el mismo `npm run ci`, con caché de npm en el workflow |
| El lint de la raíz recorre `cliente/` | Falsos errores | `eslint.config` de la raíz ignora `cliente/`; el cliente tiene su propio lint |
| T5 (andamio de Angular) supera ~400 líneas | PR grande | Excepción anticipada aquí: el andamio generado por el CLI y el cliente HTTP generado no son autoría; la autoría se mide sin ellos (`size:exception` automática en `tasks.md`) |

## Rollback

- El cliente es una carpeta aparte: borrarla y quitar sus pasos de `npm run ci` deja la API como en la 11a.
- Los endpoints de admin no cambian ningún comportamiento existente; revertir sus commits los retira y regenera el
  contrato.
- La semilla solo inserta claves que faltan; si se revierte, las filas sembradas siguen siendo válidas (son los mismos
  textos de respaldo) y se pueden borrar con `DELETE FROM parametro WHERE clave IN (...)` sin efecto visible.
