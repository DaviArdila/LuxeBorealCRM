import { crearBuscarProducto } from './buscar-producto.js';
import { crearConsultarCaso } from './consultar-caso.js';
import { crearCotizarEnvio } from './cotizar-envio.js';
import { crearDerivarAAsesor } from './derivar-a-asesor.js';
import { crearEnviarFotos } from './enviar-fotos.js';
import { crearGuardarDatosContacto } from './guardar-datos-contacto.js';
import { crearMarcarLeadCaliente } from './marcar-lead-caliente.js';
import { crearObtenerFicha } from './obtener-ficha.js';
import { crearRegistrarConsentimiento } from './registrar-consentimiento.js';

// Latencia: solo las herramientas que no cambian nada que otra del turno lea corren en paralelo dentro de un paso.

describe('modulos/agente/aplicacion/herramientas — qué herramientas son concurrentes', () => {
  it('las cuatro de consulta son concurrentes y las cinco que escriben o avisan no', () => {
    const nada = {} as never;
    const herramientas = [
      crearBuscarProducto(nada),
      crearObtenerFicha(nada),
      crearCotizarEnvio(nada),
      crearConsultarCaso(nada),
      crearEnviarFotos(nada, nada, nada),
      crearGuardarDatosContacto(nada, nada),
      crearMarcarLeadCaliente(nada),
      crearDerivarAAsesor(),
      crearRegistrarConsentimiento(nada),
    ];

    const concurrentes = herramientas.filter((h) => h.concurrente === true).map((h) => h.definicion.nombre);

    expect(concurrentes).toEqual(['buscar_producto', 'obtener_ficha', 'cotizar_envio', 'consultar_caso']);
  });
});
