# Delta for medios

## Purpose

Las fotos dejan de descargarse desde enlaces (Drive) y pasan a subirse desde el back office (CAT20). El puerto
`Almacenamiento` (MED1), la lectura por clave (MED10) y el redimensionado (MED6) se conservan; la descarga, la
idempotencia por enlace, el borrado por posición y el collage se retiran con el importador (P79).

## MODIFIED Requirements

### Requirement: MED6 — Redimensionamiento de las fotos originales a un límite de tamaño y formato

El sistema MUST redimensionar cada foto **subida desde el back office** para que su lado más largo no supere 1600 píxeles
(sin agrandar una foto más pequeña), respetando su orientación original, y MUST guardarla como JPEG con calidad 80, antes
de subirla al almacenamiento.

(Previously: se aplicaba a cada foto descargada por el importador.)

Fase que lo implementa: 03; ajustado por 13a

#### Scenario: Una foto más grande que el límite se reduce a 1600 píxeles de lado más largo

- Dada una foto original de 3000×2000 píxeles,
- Cuando se sube esa foto a un producto,
- Entonces la foto guardada en el almacenamiento tiene 1600 píxeles en su lado más largo, en formato JPEG, sin haberse
  agrandado.

#### Scenario: Una foto más pequeña que el límite no se agranda

- Dada una foto original de 800×600 píxeles,
- Cuando se sube esa foto a un producto,
- Entonces la foto guardada en el almacenamiento conserva sus 800×600 píxeles, sin agrandarse.

## REMOVED Requirements

| Requisito | Motivo | Reemplazado por |
|---|---|---|
| MED2 — Conversión de enlaces de Google Drive a URL de descarga directa | Sin descarga desde enlaces | CAT20 |
| MED3 — Detección de enlace de carpeta de Google Drive | Igual | — |
| MED4 — Detección de archivo no compartido por magic bytes, no solo por content-type | El contenido se comprueba al subir | CAT20 (`foto-invalida`) |
| MED5 — Idempotencia de descarga: solo se redescarga si cambió el origen o falta el archivo | Sin descarga | — |
| MED7 — Borrado de fotos sobrantes de importaciones previas | El borrado es explícito | CAT21 |
| MED8 — Generación de collage en una grilla según la cantidad de fotos | Se retira el collage | — |
| MED9 — El collage solo se regenera si hubo fotos nuevas o cambió el hash de enlaces de origen | Igual | — |
