import { cargarFixtureChatwoot } from '../../../../../test/soporte/chatwoot.js';
import { traducirEvento } from './traducir-evento.js';

// CAN3/CAN5 — títulos tomados literalmente de
// openspec/changes/fase-04-canal-chatwoot/specs/canales/spec.md.

/** Cadenas de datos personales/contenido que NINGÚN fixture reconocido MUST dejar en el `EventoCanal`
 * producido (R14, D4): texto de mensaje, URL de adjunto, teléfono (con y sin "+"), nombre, correo,
 * y el token de sesión del widget. `mensaje-creado-saliente-humano.json`/`mensaje-creado-nota-privada.json`
 * traen un correo real de prueba en `sender.email`: la lista blanca de `traducirEvento` nunca lo lee,
 * así que nunca puede aparecer en la salida, sin importar qué contengan los fixtures de T1. */
const CADENAS_PROHIBIDAS = [
  'Hola, quiero preguntar por un anillo de compromiso',
  'Aqui una foto del diseno que me gusta',
  'Claro, con gusto te muestro nuestras opciones de anillos',
  'chatwoot.ejemplo.local',
  '573001112233',
  '+573001112233',
  'Cliente Ejemplo',
  'brayanardila288@gmail.com',
  'token-pubsub-anonimizado',
  'wamid.',
];

function sinDatosPersonales(evento: unknown): void {
  const serializado = JSON.stringify(evento);
  for (const cadena of CADENAS_PROHIBIDAS) {
    expect(serializado).not.toContain(cadena);
  }
}

describe('canales/infraestructura/chatwoot/traducir-evento', () => {
  describe('CAN3 — Evento de tipo desconocido se ignora sin registrarse', () => {
    it('CAN3 — Un evento de un tipo distinto a los reconocidos se ignora sin registrarse', () => {
      const { json } = cargarFixtureChatwoot('evento-ignorado-conversacion-actualizada.json');

      const resultado = traducirEvento(json);

      expect(resultado).toEqual({ reconocido: false });
    });

    it('ignora un payload que no cumple el esquema mínimo (sin "event")', () => {
      const resultado = traducirEvento({ algo: 'sin forma reconocida' });

      expect(resultado).toEqual({ reconocido: false });
    });

    it('ignora un mensaje saliente del bot (no es eco humano ni entrante)', () => {
      const { json } = cargarFixtureChatwoot('mensaje-creado-saliente-bot.json');

      expect(traducirEvento(json)).toEqual({ reconocido: false });
    });

    it('ignora una nota privada aunque Chatwoot dispare el webhook (hallazgo real de T1, D4)', () => {
      const { json } = cargarFixtureChatwoot('mensaje-creado-nota-privada.json');

      expect(traducirEvento(json)).toEqual({ reconocido: false });
    });
  });

  describe('CAN5 — Redacción del payload del inbox (R14)', () => {
    it('CAN5 — Un evento con texto y adjuntos se registra sin ese contenido', () => {
      const { json } = cargarFixtureChatwoot('mensaje-creado-entrante-adjunto.json');

      const resultado = traducirEvento(json);

      expect(resultado.reconocido).toBe(true);
      if (!resultado.reconocido) throw new Error('inalcanzable');
      expect(resultado.evento).toEqual({
        v: 1,
        eventoProveedor: 'message_created',
        conversacion: {
          idExterno: '1',
          idContactoExterno: '1',
          canal: 'otro',
          canalProveedor: 'Channel::Api',
        },
        tipo: 'mensaje-entrante',
        idMensaje: '2',
        tipoContenido: 'imagen',
      });
      sinDatosPersonales(resultado.evento);
    });

    it('CAN5 — El teléfono completo del contacto nunca queda en el payload guardado', () => {
      const { json } = cargarFixtureChatwoot('mensaje-creado-entrante-texto.json');

      const resultado = traducirEvento(json);

      expect(resultado.reconocido).toBe(true);
      sinDatosPersonales(resultado);
    });

    it('ninguno de los fixtures reconocidos deja texto, adjuntos, teléfono, nombre, correo, pubsub ni wamid en el EventoCanal', () => {
      const fixturesReconocidos = [
        'mensaje-creado-entrante-texto.json',
        'mensaje-creado-entrante-adjunto.json',
        'mensaje-creado-saliente-humano.json',
        'conversacion-estado-open.json',
        'conversacion-estado-pending.json',
        'conversacion-estado-resolved.json',
      ];

      for (const nombreArchivo of fixturesReconocidos) {
        const { json } = cargarFixtureChatwoot(nombreArchivo);
        const resultado = traducirEvento(json, { xChatwootDelivery: 'entrega-de-prueba' });
        expect(resultado.reconocido).toBe(true);
        sinDatosPersonales(resultado);
      }
    });
  });

  describe('mensaje-entrante / mensaje-humano — id_externo por evento (D4)', () => {
    it('un mensaje entrante produce id_externo mensaje:<id del mensaje>', () => {
      const { json } = cargarFixtureChatwoot('mensaje-creado-entrante-texto.json');

      const resultado = traducirEvento(json);

      expect(resultado.reconocido).toBe(true);
      if (!resultado.reconocido) throw new Error('inalcanzable');
      expect(resultado.idExterno).toBe('mensaje:1');
      expect(resultado.evento.tipo).toBe('mensaje-entrante');
    });

    it('un mensaje saliente de un asesor humano se traduce a mensaje-humano (eco)', () => {
      const { json } = cargarFixtureChatwoot('mensaje-creado-saliente-humano.json');

      const resultado = traducirEvento(json);

      expect(resultado).toEqual({
        reconocido: true,
        idExterno: 'mensaje:3',
        evento: {
          v: 1,
          eventoProveedor: 'message_created',
          conversacion: {
            idExterno: '1',
            idContactoExterno: '1',
            canal: 'otro',
            canalProveedor: 'Channel::Api',
          },
          tipo: 'mensaje-humano',
          idMensaje: '3',
        },
      });
    });
  });

  describe('estado-conversacion — id_externo por dedupe de Chatwoot (D4)', () => {
    it('usa X-Chatwoot-Delivery como id_externo cuando la cabecera llega', () => {
      const { json } = cargarFixtureChatwoot('conversacion-estado-open.json');

      const resultado = traducirEvento(json, { xChatwootDelivery: 'uuid-de-entrega-1' });

      expect(resultado).toEqual({
        reconocido: true,
        idExterno: 'estado:1:open:uuid-de-entrega-1',
        evento: {
          v: 1,
          eventoProveedor: 'conversation_status_changed',
          conversacion: {
            idExterno: '1',
            idContactoExterno: '1',
            canal: 'otro',
            canalProveedor: 'Channel::Api',
          },
          tipo: 'estado-conversacion',
          estado: 'abierta',
        },
      });
    });

    it('usa X-Chatwoot-Timestamp como respaldo cuando no llega X-Chatwoot-Delivery', () => {
      const { json } = cargarFixtureChatwoot('conversacion-estado-pending.json');

      const resultado = traducirEvento(json, { xChatwootTimestamp: '1790475377' });

      expect(resultado.reconocido).toBe(true);
      if (!resultado.reconocido) throw new Error('inalcanzable');
      expect(resultado.idExterno).toBe('estado:1:pending:1790475377');
      expect(resultado.evento.tipo).toBe('estado-conversacion');
      if (resultado.evento.tipo !== 'estado-conversacion') throw new Error('inalcanzable');
      expect(resultado.evento.estado).toBe('pendiente');
    });

    it('conversacion-estado-resolved.json se traduce a estado "resuelta"', () => {
      const { json } = cargarFixtureChatwoot('conversacion-estado-resolved.json');

      const resultado = traducirEvento(json, { xChatwootDelivery: 'uuid-de-entrega-3' });

      expect(resultado.reconocido).toBe(true);
      if (!resultado.reconocido) throw new Error('inalcanzable');
      expect(resultado.evento.tipo).toBe('estado-conversacion');
      if (resultado.evento.tipo !== 'estado-conversacion') throw new Error('inalcanzable');
      expect(resultado.evento.estado).toBe('resuelta');
    });
  });
});
