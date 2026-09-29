# 06 · Cliente futuro de back office: recomendación de tecnología

- Fecha: 2026-09-23 · Estado: **recomendación, no se construye**; decisión final al inicio de la
  Fase 11, junto con P14 (`docs/PREGUNTAS_ABIERTAS.md`)
- Pregunta: si algún día se construye un cliente de inventario y ventas para el back office, ¿con
  qué tecnología, y qué necesita la API para que ese cliente sea posible sin rediseñarla?

Este documento **no autoriza construir nada**. Es la respuesta a "¿pensamos en el cliente futuro
al diseñar la API?" — sí, así — y queda registrada para cuando el usuario decida construirlo.

## Recomendación

**SPA con React + Vite + TypeScript**, TanStack Query (datos remotos) y TanStack Router
(enrutamiento), con un **cliente HTTP generado** desde `openapi/openapi.json` (candidatas: `orval` o
`@hey-api/openapi-ts`, a confirmar cuando se construya).

Por qué esta combinación y no Next.js:

- Es una herramienta interna detrás de login (asesores y admin del negocio): no necesita SEO ni
  renderizado en servidor.
- Se despliega como archivos estáticos en el mismo VPS/Dokploy, sin proceso Node adicional.
- Sirve también como **Dashboard App dentro de Chatwoot** (P14): un iframe con una SPA estática
  encaja mejor que un servidor Next.js aparte.

## Cómo funciona (para quien no lo haya operado antes)

```
 desarrollo                 build                    producción
┌───────────┐   vite build  ┌──────────────┐  sirve   ┌───────────────────┐
│ código TS/ │ ─────────────▶│ HTML/JS/CSS  │◀─────────│ Nginx o Caddy      │
│ React      │               │ estáticos    │  (RO)    │ (contenedor propio)│
└───────────┘               └──────────────┘          └─────────┬──────────┘
                                                                  │ el navegador pide los
                                                                  │ archivos una vez
                                                                  ▼
                                                        ┌────────────────────┐
                                                        │ navegador del      │
                                                        │ asesor/admin:      │
                                                        │ React corre ahí y  │
                                                        │ llama a /api/v1    │
                                                        └────────────────────┘
```

`vite build` produce HTML/JS/CSS estáticos una sola vez. Un servidor web liviano (Nginx o Caddy, en
su propio contenedor) solo **entrega** esos archivos; no ejecuta lógica de negocio ni conoce la API.
React se ejecuta en el navegador del usuario y desde ahí llama directamente a `/api/v1`.

### Diferencia con Next.js

| | React + Vite (recomendado) | Next.js |
|---|---|---|
| Dónde corre React | Solo en el navegador | En el navegador **y** en un servidor Node (SSR) |
| Qué se despliega | Archivos estáticos + servidor web liviano | Un proceso Node que renderiza en cada request |
| Costo de operación | Un contenedor que solo sirve archivos | Un proceso Node más que vigilar, escalar y actualizar |
| Cuándo tendría sentido | Herramienta interna, sin SEO | Si el cliente necesitara SEO público o un BFF (backend-for-frontend) propio |

Con un VPS de 8 GB y un equipo de dos personas, un proceso Node adicional para SSR no se paga si
nadie necesita indexar estas páginas en buscadores: se descarta salvo que aparezca un requisito de
SEO o de BFF.

## Repo separado, el contrato como única dependencia

El cliente vive en **su propio repositorio**, fuera de `LuxeBorealCRM`. Su única dependencia hacia
este backend es `openapi/openapi.json` (ADR-0008): genera su cliente HTTP desde ese archivo y no
necesita leer el código del backend para saber qué endpoints existen o qué forma tienen.

## Lo que la API ya garantiza para que este cliente sea posible

Estas garantías las fija la API **ahora**, aunque el cliente no exista todavía
(`openspec/specs/api/spec.md`):

- **Sin estado de pantalla**: la API no se diseña a la medida de una vista; paginación y filtros
  son uniformes (API5) y sirven para cualquier cliente, no solo para el back office.
- **CORS por lista blanca**: solo los orígenes autorizados pueden llamar la API desde un navegador.
- **Permisos por rol en el servidor**, nunca solo en el cliente (API7): el cliente puede ocultar un
  botón, pero el servidor es quien decide si la acción se ejecuta.
- **Errores en RFC 9457** (API4): el cliente puede mostrar un mensaje al usuario sin parsear texto
  libre, usando el código de error propio.
- **`operationId` estables** (API2): el cliente generado no se rompe con cada despliegue si el
  contrato de una operación no cambió.

## Regla de seguridad

El código de un cliente SPA es **visible en el navegador de quien lo use**. Por eso:

- El cliente **nunca** guarda secretos (claves, tokens de servicio, credenciales de terceros).
- El cliente **nunca** decide permisos; solo refleja lo que la API ya decidió (API7). Ocultar un
  botón en el cliente no reemplaza la verificación en el servidor.

## Encaje con la Dashboard App de Chatwoot (P14)

`docs/PREGUNTAS_ABIERTAS.md` (P14) deja abierto si la primera pantalla del CRM es una Dashboard App
dentro de Chatwoot (ficha del lead, crear venta al lado del chat) antes o en vez de un back office
separado. Una SPA estática generada desde el mismo contrato sirve para ambos casos sin cambiar la
API: se embebe como Dashboard App (iframe dentro de Chatwoot) o se sirve como aplicación
independiente. La decisión entre las dos formas de presentarla se toma al inicio de la Fase 11,
junto con P14.

## Requisitos de importación, exportación y sincronización (2026-09-29)

Registrados a pedido del usuario; **no autorizan construir nada** (ver ADR-0015, en `propuesta`).

- **Dos vías que conviven.** El cliente edita registros puntuales de cualquier tabla; la carga y
  edición masiva (productos, tarifas, cobertura, parámetros y políticas, festivos) se hace por
  archivo. Todo lo que se puede administrar en el catálogo debe poder administrarse también desde el
  cliente.
- **Ida y vuelta por archivo.** Descargar el estado actual desde la base como `.xlsx` (o CSV), editar
  y volver a subir. Reemplaza a Google Sheets; el archivo nace de la base, así que no puede estar
  desactualizado al empezar a editar.
- **Control de versión por fila.** Una fila que cambió en la base desde la exportación es un
  conflicto: no se pisa y se informa. Un archivo incompleto nunca desactiva productos por ausencia;
  se desactiva con una columna `activo` explícita.
- **Recuperado del panel del prototipo** (`/panel`, retirado en su ADR-0006): una pantalla por
  módulo/tabla, manejo de errores por pestaña, fila y columna, estado de la importación (qué se
  cargó y si salió bien) y la garantía de que una importación con errores deja todo como estaba.
  Además: **vista previa** antes de aplicar (crearía N, actualizaría M, rechazaría K) y una sola
  importación a la vez.
- **Endpoints previstos (Fase 14):** subir archivo, vista previa, aplicar, consultar el informe y
  exportar por tabla; solo para el rol admin (Fase 11). El resultado también puede avisarse por
  Telegram reutilizando lo de la Fase 08.
- **Tecnología del cliente.** La recomendación de arriba (React + Vite) no es vinculante: el usuario
  contempla Angular. Como el cliente se genera desde `openapi/openapi.json`, la API no cambia con
  esa elección; se decide al inicio de la Fase 11.
