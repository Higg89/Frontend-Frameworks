import type { RouteRecordRaw } from 'vue-router';
import { routeNames } from '@/types';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    component: () => import('@/layouts/AuthLayout.vue'),
    children: [
      {
        path: '',
        name: routeNames.login,
        component: () => import('@/pages/LoginPage.vue'),
        meta: {
          title: 'Вход',
          description:
            'Вход и регистрация в Todo. Демо-пользователи: Алексей, Мария и Иван, пароль demo.',
          breadcrumb: 'Вход',
          requiresAuth: false,
          // The login screen is the public entry point of the demo app, so it
          // is intentionally indexable and has its own description.
          robots: 'index,follow',
        },
      },
    ],
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: {
      title: 'Todo',
      breadcrumb: 'Главная',
      requiresAuth: true,
    },
    children: [
      {
        path: '',
        name: routeNames.tasks,
        component: () => import('@/pages/IndexPage.vue'),
        meta: {
          title: 'Список задач',
          description:
            'Управляйте задачами: добавляйте новые, отмечайте выполненные, ищите и фильтруйте список.',
          breadcrumb: 'Задачи',
          requiresAuth: true,
        },
      },
      {
        path: 'settings',
        name: routeNames.settings,
        component: () => import('@/pages/SettingsPage.vue'),
        meta: {
          title: 'Настройки',
          description: 'Настройки Todo: тема оформления и отображение даты создания задач.',
          breadcrumb: 'Настройки',
          requiresAuth: true,
          robots: 'noindex,nofollow',
        },
      },
    ],
  },
  {
    path: '/404',
    name: routeNames.notFound,
    component: () => import('@/pages/NotFoundPage.vue'),
    meta: {
      title: 'Страница не найдена',
      description: 'Запрошенная страница не найдена. Вернитесь к списку задач Todo.',
      breadcrumb: 'Не найдено',
      requiresAuth: false,
      robots: 'noindex,nofollow',
    },
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('@/pages/NotFoundPage.vue'),
    meta: {
      title: 'Страница не найдена',
      description: 'Запрошенная страница не найдена. Вернитесь к списку задач Todo.',
      breadcrumb: 'Не найдено',
      requiresAuth: false,
      robots: 'noindex,nofollow',
    },
  },
];

export default routes;
