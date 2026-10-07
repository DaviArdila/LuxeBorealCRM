# Cliente: rediseño de estilos, shell y grillas

Rama: `feat/cliente-estilos` (trabajo fuera de fase, solo ODD). Alcance: solo `cliente/`.
La filosofía de estilos y el ADR se documentan **al final**, con lo que el usuario valide (T7).

## Objetivo
Aprovechar el espacio del back office: riel lateral que se expande al pasar el mouse, logo en el menú sin
barra superior, avisos que se pliegan a un icono, grillas de tarjetas con ventanas para ver/editar,
controles ~10 % más compactos.

## Tareas
- [x] T1 Tokens `--luxe-*` y densidad -10 % de filtros/botones (`cliente/src/styles.scss`) (ae1258e)
- [ ] T2 Shell: riel fijo 4.5rem con expansión superpuesta al hover/foco; logo al menú; sin barra superior en escritorio; sin botón «Compactar menú»; `.pagina` más ancha
- [ ] T3 Compartidos: `app-cabecera-pagina`, `app-rejilla`, `app-tarjeta-elemento`, `app-aviso` modo flotante plegable
- [ ] T4 Casos de uso: grilla de categorías → ventana de casos → ventana de lectura → edición; filtros compactos
- [ ] T5 Estilo del bot: buscador, grilla de secciones, arrastrar para reordenar, historial en ventana, aviso de tope flotante
- [ ] T6 Configuración (horario, envíos, gasto LLM) e Inicio con cabecera y grilla
- [ ] T7 (tras visto bueno) documentar la filosofía + ADR propuesta

## Verificación
`npm --prefix cliente run ci`; recorrido manual con `npm start`.

## Progreso
Ruta: un escritor delegado (más de 2 archivos no triviales). El hash de cada tarea se anota junto a su casilla.
- T1: CSS puro, sin RED posible; verificado con `npm run build` y `npm run lint` (densidad -1 y tokens `--luxe-*`).
