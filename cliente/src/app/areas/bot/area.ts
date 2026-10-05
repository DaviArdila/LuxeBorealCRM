import type { DefinicionArea } from '../../nucleo/definicion-area';

export const AREA_BOT: DefinicionArea = {
  id: 'bot',
  titulo: 'Bot',
  icono: 'forum',
  roles: ['admin'],
  menu: [
    { titulo: 'Estilo del bot', ruta: '/bot/estilo', roles: ['admin'] },
    { titulo: 'Mensajes fijos', ruta: '/bot/mensajes-fijos', roles: ['admin'] },
  ],
  rutas: () => import('./bot.routes').then((modulo) => modulo.BOT_ROUTES),
};
