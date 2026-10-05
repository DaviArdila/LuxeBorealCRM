import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { AvisoComponent } from '../compartido/aviso.component';
import { leerProblema } from '../nucleo/problema';
import { SesionServicio } from '../nucleo/sesion.servicio';

/** CLT4: correo y contraseña. Nada de lo tecleado se guarda en el navegador ni va a la URL. */
@Component({
  selector: 'app-entrar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    MatButton,
    MatCard,
    MatCardContent,
    MatCardHeader,
    MatCardTitle,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatInput,
    MatLabel,
    MatSuffix,
  ],
  template: `
    <main class="entrar">
      <mat-card class="tarjeta" appearance="outlined">
        <mat-card-header>
          <mat-card-title>
            <h1 class="titulo"><mat-icon fontIcon="auto_awesome" aria-hidden="true" /> LuxeBoreal</h1>
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form class="formulario" (submit)="enviar($event)" novalidate>
            <mat-form-field appearance="outline">
              <mat-label>Correo</mat-label>
              <input matInput id="email" name="email" type="email" autocomplete="username"
                     [value]="email()" (input)="email.set($any($event.target).value)" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Contraseña</mat-label>
              <input matInput id="contrasena" name="contrasena" autocomplete="current-password"
                     [type]="contrasenaVisible() ? 'text' : 'password'"
                     [value]="contrasena()" (input)="contrasena.set($any($event.target).value)" />
              <button mat-icon-button matSuffix type="button"
                      [attr.aria-label]="contrasenaVisible() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                      [attr.aria-pressed]="contrasenaVisible()" (click)="contrasenaVisible.set(!contrasenaVisible())">
                <mat-icon [fontIcon]="contrasenaVisible() ? 'visibility_off' : 'visibility'" aria-hidden="true" />
              </button>
            </mat-form-field>
            @if (mensaje(); as texto) {
              <app-aviso tipo="error">{{ texto }}</app-aviso>
            }
            <button mat-flat-button type="submit" [disabled]="!puedeEnviar()">
              <mat-icon fontIcon="login" aria-hidden="true" />Entrar
            </button>
          </form>
        </mat-card-content>
      </mat-card>
    </main>
  `,
  styles: `
    .entrar {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .tarjeta {
      width: 100%;
      max-width: 24rem;
    }
    .titulo {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0 0 1rem;
      font: var(--mat-sys-headline-small);
    }
    .formulario {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
  `,
})
export class EntrarComponent implements OnDestroy {
  private readonly sesion = inject(SesionServicio);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly contrasena = signal('');
  protected readonly mensaje = signal<string | null>(null);
  protected readonly enviando = signal(false);
  protected readonly contrasenaVisible = signal(false);
  private readonly segundosDeEspera = signal(0);
  private temporizador: ReturnType<typeof setInterval> | undefined;

  protected readonly puedeEnviar = computed(() => !this.enviando() && this.segundosDeEspera() === 0);

  async enviar(evento: Event): Promise<void> {
    evento.preventDefault();
    if (!this.puedeEnviar() || this.email().trim() === '' || this.contrasena() === '') return;
    this.enviando.set(true);
    this.mensaje.set(null);
    try {
      await this.sesion.iniciar(this.email().trim(), this.contrasena());
      this.contrasena.set('');
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.contrasena.set('');
      const problema = leerProblema(error);
      if (problema.codigo === 'demasiados-intentos') {
        this.esperar(problema.esperarSegundos ?? 60);
      } else if (problema.codigo === 'credenciales-invalidas') {
        this.mensaje.set('Correo o contraseña incorrectos');
      } else {
        this.mensaje.set('No se pudo iniciar sesión. Inténtalo de nuevo en un momento.');
      }
    } finally {
      this.enviando.set(false);
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.temporizador);
  }

  private esperar(segundos: number): void {
    const minutos = Math.ceil(segundos / 60);
    this.mensaje.set(
      `Demasiados intentos. Espera ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} para volver a intentar.`,
    );
    this.segundosDeEspera.set(segundos);
    clearInterval(this.temporizador);
    this.temporizador = setInterval(() => {
      this.segundosDeEspera.update((restantes) => Math.max(0, restantes - 1));
      if (this.segundosDeEspera() === 0) {
        clearInterval(this.temporizador);
        this.mensaje.set(null);
      }
    }, 1000);
  }
}
