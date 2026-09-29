# Design: Políticas del negocio como parámetros, contra entrega y fuera de cobertura

- Change: `politicas-contraentrega` · Fecha: 2026-09-29 · Estado: spec en revisión

## Decisiones

### D1 — Convención de claves y validación

Una política es una fila de `parametro` con clave `politica_<tema>`. El tema (lo que sigue al prefijo)
cumple `^[a-z0-9_]+$` y no es vacío. El valor es un texto recortado, no vacío, de hasta 1.200
caracteres, guardado como cadena jsonb. Las funciones puras viven en
`catalogo/dominio/politica.ts`: `esClavePolitica`, `temaDeClave`, `claveDeTema`,
`validarTextoPolitica`. `validar-catalogo.ts` las usa para las claves con prefijo `politica_`: una
política inválida es **error** (columna `clave` si el tema es inválido, `valor` si el texto lo es),
no advertencia. El tope de 1.200 caracteres es criterio propio de este cambio y es una constante del
dominio, no un parámetro.

### D2 — Puerto y caso de uso

`RepositorioPolitica` (puerto en `catalogo/puertos/`): `obtener(tema): Promise<string | null>` y
`listarTemas(): Promise<string[]>`. Adaptador Prisma sobre `parametro` filtrando por prefijo. El caso
de uso `ConsultarPolitica.ejecutar(tema)` devuelve `{ encontrada: true, texto }` o
`{ encontrada: false, temasDisponibles }`. El respaldo `contra_entrega` se resuelve en el caso de
uso (dominio), no en el adaptador, para que sea testeable sin base. Temas disponibles = unión
ordenada y sin repetir de los configurados y los de respaldo. Sin cambio de esquema.

### D3 — Texto aprobado de contra entrega (respaldo)

«Tu pedido se envía contra entrega: pagas cuando lo recibes. El recargo por contra entrega se suma al
total de tu compra. Te enviaremos la evidencia del despacho (guía y foto del paquete). Al recibirlo
tienes derecho a abrirlo y revisarlo: verifica que sea exactamente lo que pediste y, si presenta
cualquier novedad, puedes devolverlo de inmediato.» Vive como constante en `politica.ts` (respaldo
por defecto, igual que el mensaje de fuera de cobertura); el negocio lo sobrescribe con
`politica_contra_entrega`.

### D4 — Cotización devuelve la política solo con contra entrega

`CotizarEnvio` recibe `RepositorioPolitica` (o `ConsultarPolitica`) y, si la tarifa elegida tiene
`contraentregaDisponible`, agrega `politicaContraentregaTexto`. `ResultadoCotizacion` con cobertura
gana ese campo opcional. Sin contra entrega no se consulta la política.

### D5 — La ficha no expone el recargo

Se elimina `recargoContraentregaTexto` de la ficha, `obtenerRecargoContraentregaPct` del puerto
`RepositorioParametro` (y su implementación), y `formatearRecargoContraentrega` de
`compartido/dinero`. `recargo_contraentrega_pct` sigue en el registro de parsers del importador
(dato interno para la Fase 13). Antes de borrar se busca con `rg` cualquier otro consumidor en
`src/` y `test/`.

### D6 — Fuera de cobertura sin promesa

`MENSAJE_FUERA_COBERTURA_POR_DEFECTO` pasa a «Por ahora no tenemos cobertura de envío a tu ciudad.
Si quieres, indícame otra dirección de entrega.». Sigue siendo sobrescribible por
`mensaje_fuera_cobertura`.

### D7 — Sin cambio de esquema ni de contrato HTTP

No hay migración Prisma ni endpoints nuevos; `openapi/` no cambia.

## Archivos

| Archivo | Cambio |
|---|---|
| `catalogo/dominio/politica.ts` (+test) | Nuevo: helpers, constantes, validación |
| `catalogo/dominio/validar-catalogo.ts` | Regla de prefijo `politica_` |
| `catalogo/puertos/repositorio-politica.ts` | Nuevo puerto |
| `catalogo/infraestructura/repositorio-politica-prisma.ts` | Nuevo adaptador |
| `catalogo/aplicacion/consultar-politica.ts` | Nuevo caso de uso |
| `catalogo/aplicacion/cotizar-envio.ts`, `dominio/envio.ts` | Campo `politicaContraentregaTexto` |
| `catalogo/aplicacion/obtener-ficha-producto.ts`, `dominio/producto.ts` | Ficha sin recargo |
| `catalogo/puertos/repositorio-parametro.ts`, `infraestructura/repositorio-parametro-prisma.ts` | Se retira el método del recargo; nuevo texto de fuera de cobertura |
| `compartido/dinero/dinero.ts` (+test) | Se retira `formatearRecargoContraentrega` |
| `catalogo/catalogo.module.ts` | Cablea puerto, adaptador y caso de uso |
| `MODELO_DATOS.md`, `docs/migracion/inventario.md` | Convención y recargo interno |

## Estrategia de pruebas

TDD estricto, Vitest. Unitarias para dominio y casos de uso con dobles en memoria; integración
(Testcontainers) para el adaptador Prisma y el importador con filas `politica_*`. Cada escenario
nuevo o modificado tiene un test titulado `<ID> — <título>`. Las escenas de R1/R2 (agente) se
prueban en la Fase 07.

## Matriz de amenazas

No aplica: no hay endpoints, autenticación ni datos personales nuevos. R14 se mantiene: no se
loguea el texto de las políticas.
