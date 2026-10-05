import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter } from '@angular/router';
import { REGISTRO_DE_AREAS } from './areas/registro/registro';
import { routes } from './app.routes';
import { AREAS_REGISTRADAS } from './nucleo/areas.token';
import { provideApiMismoOrigen } from './nucleo/configuracion-api';
import { csrfInterceptor } from './nucleo/csrf.interceptor';
import { erroresHttpInterceptor } from './nucleo/errores-http.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([csrfInterceptor, erroresHttpInterceptor])),
    provideApiMismoOrigen(),
    provideRouter(routes),
    // Íconos: ligaduras de Material Symbols (paquete `material-symbols`, en angular.json) con `fontIcon`,
    // para que el nombre del ícono no quede en el texto de los botones ni lo lea un lector de pantalla.
    provideAppInitializer(() => {
      inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined', 'mat-ligature-font');
    }),
    { provide: AREAS_REGISTRADAS, useValue: REGISTRO_DE_AREAS },
  ],
};
