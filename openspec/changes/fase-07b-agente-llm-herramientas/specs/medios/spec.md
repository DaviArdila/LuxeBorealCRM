# Delta for Medios

## ADDED Requirements

### Requirement: MED10 — Leer un objeto guardado por su clave

El puerto `Almacenamiento` MUST ofrecer la lectura de un objeto por su clave, devolviendo su
contenido y su tipo de contenido, para que quien necesite subir el archivo a otro sistema (el canal
de salida) no dependa de una URL pública ni de un disco local (MED1, ADR-0012). Leer una clave que no
existe MUST fallar con un error tipado propio del módulo, sin exponer detalles del proveedor.

Fase que lo implementa: 07b

#### Scenario: Un objeto guardado se lee con su contenido y tipo

- Dado un objeto guardado bajo una clave con tipo `image/jpeg`,
- Cuando se lee esa clave,
- Entonces se obtienen los mismos bytes y el tipo `image/jpeg`.

#### Scenario: Leer una clave inexistente falla con un error tipado

- Dado una clave que no corresponde a ningún objeto,
- Cuando se lee,
- Entonces la lectura falla con el error tipado de objeto no encontrado.
