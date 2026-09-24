/**
 * Rechaza `promesa` con un error genérico si no se resuelve antes de `ms` milisegundos (D13,
 * PLT4). Usa `setTimeout` para medir una duración, no la hora del sistema — no es una lectura de
 * "la hora actual" y por lo tanto no está sujeta a la restricción de `plataforma/reloj` (PLT2,
 * skill `luxeboreal-arquitectura` §3): esa regla gobierna `Date.now()`/`new Date()`, no
 * temporizadores.
 */
export async function conTimeout<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promesa,
      new Promise<never>((_resolver, rechazar) => {
        temporizador = setTimeout(() => {
          rechazar(new Error('tiempo de espera agotado'));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(temporizador);
  }
}
