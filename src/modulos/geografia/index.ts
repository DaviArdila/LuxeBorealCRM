/**
 * Superficie pública de `modulos/geografia` (design.md D8). Nadie fuera de este módulo importa
 * rutas internas (`./dominio/geografia.js`, `./puertos/repositorio-geografia.js`, etc.) — regla de
 * fronteras `sin-rutas-internas-de-modulo`. El puerto se exporta para que otros módulos (catálogo,
 * contactos, ventas) puedan inyectar `REPOSITORIO_GEOGRAFIA` en su propia `infraestructura/`.
 */
export { GeografiaModule } from './geografia.module.js';
export {
  REPOSITORIO_GEOGRAFIA,
  type ConteoGuardado,
  type RepositorioGeografia,
  type ResumenGuardado,
} from './puertos/repositorio-geografia.js';
export {
  esCodigoCiudadValido,
  esCodigoDepartamentoValido,
  FuenteDivipolaInvalida,
  type CatalogoGeografico,
  type Ciudad,
  type Departamento,
} from './dominio/geografia.js';
