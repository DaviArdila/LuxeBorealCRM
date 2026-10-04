import { REGISTRO_DE_AREAS } from './registro';

describe('D9 — El registro de áreas describe cada área con datos coherentes', () => {
  it('cada área tiene un id único', () => {
    const ids = REGISTRO_DE_AREAS.map((area) => area.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('las entradas del menú cuelgan de la ruta del área y no piden más roles que el área', () => {
    for (const area of REGISTRO_DE_AREAS) {
      for (const entrada of area.menu) {
        expect(entrada.ruta.startsWith(`/${area.id}/`)).toBe(true);
        for (const rol of entrada.roles) {
          expect(area.roles).toContain(rol);
        }
      }
    }
  });

  it('el área Bot es solo de admin y carga sus rutas en diferido', async () => {
    const bot = REGISTRO_DE_AREAS.find((area) => area.id === 'bot');

    expect(bot?.roles).toEqual(['admin']);
    const rutas = await bot!.rutas();
    expect(rutas.map((ruta) => ruta.path)).toEqual(['', 'estilo', 'mensajes-fijos']);
  });
});
