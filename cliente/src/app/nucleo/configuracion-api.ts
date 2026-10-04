import { provideApiConfiguration } from '../api/api-configuration';

/**
 * Las rutas del cliente generado ya empiezan con `/api/v1`: el cliente llama al mismo origen, sin
 * prefijo (D6). La app y los tests de las demás carpetas lo piden aquí, sin importar `api/`.
 */
export function provideApiMismoOrigen() {
  return provideApiConfiguration('');
}
