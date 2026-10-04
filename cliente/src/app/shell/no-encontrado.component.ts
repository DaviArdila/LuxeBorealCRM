import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-no-encontrado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: '<h1>No encontramos esa pantalla</h1><a routerLink="/">Volver al inicio</a>',
})
export class NoEncontradoComponent {}
