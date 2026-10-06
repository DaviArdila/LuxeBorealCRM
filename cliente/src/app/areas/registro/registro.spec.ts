import { REGISTRO_DE_AREAS } from './registro';

describe('D9 — El registro de áreas describe cada área con datos coherentes', () => {
  it('cada área tiene un id único', () => {
    const ids = REGISTRO_DE_AREAS.map((area) => area.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('las entradas del menú cuelgan de la ruta del área y no piden más roles que el área', () => {
    for (const area of REGISTRO_DE_AREAS) {
      for (const entrada of area.menu) {
        const pantallas = entrada.hijos ?? [entrada];
        for (const pantalla of [entrada, ...pantallas]) {
          for (const rol of pantalla.roles) {
            expect(area.roles).toContain(rol);
          }
        }
        for (const pantalla of pantallas) {
          expect(pantalla.ruta?.startsWith(`/${area.id}/`)).toBe(true);
        }
      }
    }
  });

  it('el área Asistente es solo de admin y carga sus rutas en diferido', async () => {
    const asistente = REGISTRO_DE_AREAS.find((area) => area.id === 'asistente');

    expect(asistente?.roles).toEqual(['admin']);
    const rutas = await asistente!.rutas();
    expect(rutas.map((ruta) => ruta.path)).toEqual(['', 'casos', 'estilo']);
  });

  it('SHL11 — El área Configuración es solo de admin y carga Horario, Envíos y Gasto del LLM en diferido', async () => {
    const configuracion = REGISTRO_DE_AREAS.find((area) => area.id === 'configuracion');

    expect(configuracion?.roles).toEqual(['admin']);
    const rutas = await configuracion!.rutas();
    expect(rutas.map((ruta) => ruta.path)).toEqual(['', 'horario', 'envios', 'gasto-llm']);
    expect(configuracion!.menu[0]?.hijos?.map((hijo) => hijo.titulo)).toEqual(['Horario', 'Envíos', 'Gasto del LLM']);
  });
});
