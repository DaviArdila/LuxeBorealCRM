import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Pantalla provisional: T8 la reemplaza por la edición de los mensajes fijos (CLT8). */
@Component({
  selector: 'app-mensajes-fijos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<h1>Mensajes fijos</h1>',
})
export class MensajesFijosComponent {}
