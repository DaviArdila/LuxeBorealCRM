import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
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
    providePrimeNG({ theme: { preset: Aura } }),
    { provide: AREAS_REGISTRADAS, useValue: REGISTRO_DE_AREAS },
  ],
};
