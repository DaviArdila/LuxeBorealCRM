# Verify report: Fase 08b — Comportamiento del agente y fotos

- Fecha: 2026-10-01 · Ramas: `fase-08b-p1-prompt` … `fase-08b-p5-evals` (5 PRs apilados, `stacked-to-main`) más la
  spec en `fase-08b-comportamiento-agente` (#43)
- Change: `openspec/changes/archive/2026-10-01-fase-08b-comportamiento-agente/`
- Commits de unidad de trabajo: T1 `4dc7a86`; T2 `e69db4a`; T3 `99f5040`; T4 `e6fb03d`; T5 `27be661`; T6 y T7 `b6b0a51`
  (van juntos: el pie de foto es parte del resultado de `ObtenerFotosProducto`); T8 `8b46682`; cierre documental en este
  commit. Además `d329c61` (fuera de tarea): corrige el test de punta a punta del importador, que esperaba un collage
  para un producto de una sola foto (lo atrapó el CI de #46; no corre en local sin MinIO).

## Alcance verificado

Las nueve tareas `[x]`. **T8 queda con dos pendientes `[manual]`**: la corrida real de evals con el prompt nuevo
(EVL3, exige la clave de OpenAI del dueño) y la verificación por WhatsApp. Lo automático está completo: prompt en
`reglas.v2.md` (no negociable) y `estilo.v2.md` (editable), SKU interno, `foto.angulo` con migración,
`fotos_angulos` en el importador, collage opcional y sin casillas vacías, `enviar_fotos` con portada o ángulo y pie de
foto armado por el backend. **No se llamó a ningún LLM real ni a Chatwoot real.**

## Checks ejecutados (comandos reales)

Entorno: sin Docker; Postgres 16 y Redis locales con un `globalSetup` alterno fuera del repo (MinIO no disponible).

| Comando | Resultado |
|---|---|
| `npm run lint` · `typecheck` · `fronteras` · `contrato:deriva` · `commits` | Verde |
| `npm test` (unit) | 1035 pasan; 7 fallan por necesitar Docker (los mismos de `main`) |
| `vitest --project integracion` (locales) | 327 pasan; 7 fallan por necesitar MinIO (los mismos de `main`) |
| `vitest --project e2e` (locales) | Verde: 35 tests (10 de `agente-llm`, 2 nuevos del ángulo) |
| `vitest --project evals` (guionado, locales) | Verde: 34 pasan, 1 omitido (el modo real); 20 casos y 10 negativos, veredicto APROBADA |

`npm run ci` de GitHub corrió en cada PR de la cadena. El primer CI de #46 falló por el test de MinIO descrito arriba;
se arregló en su causa y los CI siguientes corrieron en verde.

## Escenarios de spec — cobertura real

| Requisito | Escenarios | Dónde se prueba |
|---|---|---|
| AGT13 (mod.) | 4 | `ensamblar-prompt.spec.ts`, `prompts-build.spec.ts` |
| AGT15 | 2 | `aserciones.spec.ts`, casos negativos `neg-emojis` |
| AGT16 | 4 | `producto.spec.ts`, `buscar-producto.spec.ts`, `obtener-ficha.spec.ts`, `aserciones.spec.ts` |
| CAT4 (mod.) | 3 | `producto.spec.ts`, `obtener-catalogo-compacto.spec.ts` |
| IMP14 | 4 | `validar-catalogo.spec.ts`, `procesar-fotos.spec.ts`, integración de `repositorio-importacion` |
| IMP15 | 2 | `procesar-fotos.spec.ts`, `cargar-configuracion.spec.ts` |
| MED8 (mod.) | 6 | `collage.spec.ts` (con comprobación de píxeles) |
| CAT14 (mod.) | 4 | `obtener-fotos-producto.spec.ts`, integración de `repositorio-producto` |
| AGT9 (mod.) | 5 | `enviar-fotos.spec.ts`, e2e `agente-llm` (portada, ángulo, ángulo inexistente) |
| AGT17 | 2 | `producto.spec.ts`, `obtener-fotos-producto.spec.ts`, `enviar-fotos.spec.ts`, e2e |
| R13 (mod.) | 1 nuevo + 6 vigentes | caso de evals `r13-una-foto`; el resto sin cambio |

## Desviaciones respecto a la spec

1. El delta de `catalogo` no incluía CAT4 (su texto decía «sku + nombre + descripción corta»): se agregó como MODIFIED
   con un escenario nuevo (T3).
2. T6 y T7 en un solo commit y la ficha con `angulosFotos` sin escenario propio (cubierta por test y por D4).
3. El escenario MED9 «archivo faltante» pasó a dos fotos: con MED8 nuevo una foto ya no genera collage (T5).
4. El escenario «Los efectos de imagen se agregan después del texto» (AGT) hablaba de «modo collage»; se actualizó a la
   portada en la spec vigente.
5. El multipart de Chatwoot convierte el salto de línea del pie de foto en CRLF; el e2e lo normaliza.

## Límites conocidos

- **Nada se probó con un modelo real.** Las evals guionadas prueban las aserciones y el cableado; que el modelo cumpla el
  estilo (sin emojis, viñetas) y pida el ángulo correcto lo decide la corrida real `[manual]` (EVL3). Hasta entonces el
  agente sigue sin exponerse a clientes.
- Con el collage apagado, el archivo de collage de una importación anterior queda huérfano en el almacenamiento
  (`clave_collage` pasa a nula); no hay limpieza automática.
- El `id` (UUID) del catálogo compacto cuesta unos 10 tokens más por producto que el SKU: se revisa con el catálogo real.
- La ficha lista ángulos pero no dice qué muestra cada foto más allá de su etiqueta; un ángulo no etiquetado no se pide.

## Pendientes abiertos

- `[manual]` T8: corrida real de evals (`EVALS_MODO=real`, `gpt-5.6-luna` y el candidato; registrar costo) y verificación por
  WhatsApp con una conversación real.
- Heredados: P30 (set dorado), P32 (evals reales), P36 (Telegram real), P41 (token de lectura en producción).

## Qué aprendimos que cambia las fases siguientes

1. **Lo que el modelo no ve, no lo puede decir**: para el SKU, quitarlo del contexto fue más seguro que pedirle en el
   prompt que no lo cite. La próxima regla de negocio sobre contenido debería ser estructural antes que textual.
2. **El estilo ya es un archivo aparte** (`estilo.v2.md`): la **Fase 08c** solo cambia de dónde se lee (base de datos con
   el `.md` de respaldo), sin tocar el ensamblador ni las reglas. El prefijo (reglas + estilo + catálogo) sigue estable.
3. **Un test de punta a punta que depende de MinIO no corre en local**: cualquier cambio de comportamiento del importador
   debe buscar sus expectativas en `importar-catalogo-cli.spec.ts` a mano antes de empujar.
4. El collage del importador tenía un defecto de diseño (lienzo siempre 2×2): se veía con una sola foto. Los datos de
   desarrollo (1-2 fotos por producto) lo habrían mostrado antes; las pruebas de imagen deben comprobar píxeles.
