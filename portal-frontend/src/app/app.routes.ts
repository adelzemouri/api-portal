import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Overview · API Hub',
    loadComponent: () => import('./overview.component').then((m) => m.OverviewComponent),
  },
  {
    path: 'apis',
    title: 'APIs · API Hub',
    loadComponent: () => import('./apis-page.component').then((m) => m.ApisPageComponent),
  },
  {
    path: 'apis/:env/:apiId',
    title: 'API · API Hub',
    loadComponent: () => import('./api-page.component').then((m) => m.ApiPageComponent),
  },
  {
    path: 'applications',
    title: 'Applications · API Hub',
    loadComponent: () => import('./applications-page.component').then((m) => m.ApplicationsPageComponent),
  },
  {
    path: 'help',
    title: 'Help · API Hub',
    loadComponent: () => import('./help.component').then((m) => m.HelpComponent),
  },
  { path: '**', redirectTo: '' },
];
