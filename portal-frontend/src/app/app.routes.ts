import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Overview · API Portal',
    loadComponent: () => import('./overview.component').then((m) => m.OverviewComponent),
  },
  {
    path: 'apis',
    title: 'APIs · API Portal',
    loadComponent: () => import('./apis-page.component').then((m) => m.ApisPageComponent),
  },
  {
    path: 'apis/:env/:apiId',
    title: 'API · API Portal',
    loadComponent: () => import('./api-page.component').then((m) => m.ApiPageComponent),
  },
  {
    path: 'applications',
    title: 'Applications · API Portal',
    loadComponent: () => import('./applications-page.component').then((m) => m.ApplicationsPageComponent),
  },
  {
    path: 'help',
    title: 'Help · API Portal',
    loadComponent: () => import('./help.component').then((m) => m.HelpComponent),
  },
  { path: '**', redirectTo: '' },
];
