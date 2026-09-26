import { afterEach, describe, expect, it, vi } from 'vitest';
import { convertirEnlaceDrive, descargarFoto, EnlaceCarpetaDrive } from './descarga-drive.js';

// T6 (fase-03-importador-medios): MED2 (conversión de enlaces, pura, sin red) y MED3 (rechazo de
// carpeta antes de cualquier petición). MED4 (magic bytes) es de integración
// (test/integracion/catalogo/descarga-drive.spec.ts, design.md "Testing Strategy") porque necesita
// un servidor HTTP real, aunque local.

describe('modulos/catalogo/infraestructura/descarga-drive', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('MED2 — conversión de enlaces de Google Drive a URL de descarga directa', () => {
    it('MED2 — Un enlace de archivo de Drive en cualquiera de sus formatos se convierte a descarga directa', () => {
      const esperado = 'https://drive.google.com/uc?export=download&id=ID';

      expect(convertirEnlaceDrive('https://drive.google.com/file/d/ID/view?usp=sharing')).toBe(esperado);
      expect(convertirEnlaceDrive('https://drive.google.com/open?id=ID')).toBe(esperado);
      expect(convertirEnlaceDrive('https://drive.google.com/uc?id=ID&export=view')).toBe(esperado);
    });

    it('MED2 — Un enlace que no es de Google Drive se conserva tal cual', () => {
      const enlace = 'https://cdn.tienda.com/fotos/lampara.jpg';

      expect(convertirEnlaceDrive(enlace)).toBe(enlace);
    });
  });

  describe('MED3 — Detección de enlace de carpeta de Google Drive', () => {
    it('MED3 — Un enlace de carpeta de Drive se rechaza antes de intentar descargar', async () => {
      const fetchEspiado = vi.fn();
      vi.stubGlobal('fetch', fetchEspiado);

      await expect(
        descargarFoto('https://drive.google.com/drive/u/0/folders/abc123'),
      ).rejects.toBeInstanceOf(EnlaceCarpetaDrive);
      expect(fetchEspiado).not.toHaveBeenCalled();
    });
  });
});
