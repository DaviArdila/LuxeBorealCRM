# Proposal: Fase 08c — El estilo del agente se edita desde la base de datos

- Change: `fase-08c-prompts-en-base-de-datos` · Fase de la hoja de ruta: **08c** · Rama: `fase-08c-prompts-en-base-de-datos`
- Fecha: 2026-10-01 · Estado: **aprobada** por el dueño (2026-10-01; ADR-0020 aceptado; Q1 y Q2 resueltas)
- Depende de: **08b cerrada** (el estilo ya es un archivo aparte, `estilo.v2.md`).

## Intent

El dueño quiere probar cómo suena el bot (tono, formato, emojis) **cambiando un texto**, sin desplegar y con
vuelta atrás. Hoy el estilo es un archivo del repositorio; cambiarlo exige un commit y un despliegue. Esta
fase lo lee de `parametro` con el archivo como respaldo, valida lo que se publica, guarda las últimas 10
versiones y mantiene una copia en memoria que se invalida al publicar, para que el bot no pague una consulta
a la base por mensaje. Las reglas no negociables y la plantilla del turno **no** se tocan.

Éxito: publicar un estilo nuevo con un comando cambia la respuesta del bot en el siguiente mensaje, sin reiniciar;
sin estilo publicado rige el archivo; `restaurar` vuelve a una versión anterior.

## Decisiones ya tomadas (no se reabren)

| Tema | Decisión | Dónde |
|---|---|---|
| Qué se edita | Solo el **estilo**; las reglas no negociables siguen en código | Dueño, 2026-10-01 |
| Dónde se guarda | Clave/valor en `parametro` primero, con el `.md` versionado como respaldo | P45 |
| Fotos y ángulos | Ya hechos en la 08b; no se tocan | 08b |

## Scope

### In Scope

1. **ADR-0020** (propuesta; se acepta antes de implementar).
2. **Validación** pura del estilo: no vacío, ≤ 4.000 caracteres, sin pesos (R1), sin SKU (AGT16), sin `{{...}}`.
3. **Lectura** de `prompt_estilo` con respaldo en `estilo.v2.md`, con **copia en memoria** e invalidación por
   versión en Redis (patrón CAT5).
4. **Publicar, historial y restaurar** (casos de uso) con las últimas 10 versiones en `prompt_estilo_historial`.
5. **Comando** `npm run prompt:estilo` (`ver`, `historial`, `publicar`, `restaurar`).
6. **Evals y e2e** del estilo leído de la base, y la guía de operación para editarlo.

### Out of Scope

| Qué | Dónde | Motivo |
|---|---|---|
| Pantalla de edición, borradores, vista previa, autoría | Fases 11-14 (back office) | Exigen usuarios y auth; hoy edita una sola persona |
| Tabla `prompt` con versionado (alternativa B del ADR) | Si hace falta | Es decisión de esquema del dueño; no se necesita aún |
| Editar `reglas` o `turno` desde la base | Nunca | Son lo no negociable (R1, R2, R14) |
| Corrida real de evals con un estilo nuevo | `[manual]` del dueño (EVL3) | Exige su clave de OpenAI |

## Qué se migra del prototipo

No aplica: mejora del código nuevo. El prototipo no se consulta.

| Prototipo | Decisión | Motivo |
|---|---|---|
| (ninguno) | — | La fase no reemplaza tests ni reglas del prototipo |

## Preguntas abiertas

| Id | Estado | Nota |
|---|---|---|
| ADR-0020 | **Aceptado (2026-10-01)** | Alternativas A/B y 1/2/3; se eligió A + 3 (versión completa) |
| **Q1** — límite de caracteres | **Resuelta (2026-10-01)** | 4.000 caracteres (≈ 1.000 tokens): atrapa un descuido y no deja que el estilo compita con las reglas; subirlo después es cambiar una constante |
| **Q2** — historial | **Resuelta (2026-10-01)** | Las últimas 10 versiones |

## Risks

| Riesgo | Efecto | Mitigación |
|---|---|---|
| Un estilo malo llega al cliente | Mala imagen o regla rota | Validación, historial con `restaurar`, y recordatorio de la corrida real (EVL3); las reglas no se editan |
| La caché de prompts del proveedor se rompe | Un turno más caro por cada cambio | Es un costo único por cambio; el prefijo vuelve a ser estable |
| Redis cae | No se puede comparar la versión | El turno lee la base y sigue (escenario propio) |

## Rollback

- Quitar la fila `prompt_estilo` (o `npm run prompt:estilo -- restaurar`) devuelve el estilo del archivo.
- Revertir el código deja el estilo en `estilo.v2.md`; las filas de `parametro` quedan sin leerse.
