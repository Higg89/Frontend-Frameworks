import type { Pinia } from 'pinia';
import type { RouteLocationNormalized, Router } from 'vue-router';
import { useUserStore } from '@/stores/userStore';
import { routeNames } from '@/types';

/** Registers the only navigation guard used by the app. */
export function setupRouterGuards(router: Router, pinia: Pinia): void {
  router.beforeEach((to: RouteLocationNormalized) => {
    const userStore = useUserStore(pinia);

    if (to.meta.requiresAuth === true && !userStore.isAuthenticated) {
      return {
        name: routeNames.login,
        query: { redirect: to.fullPath },
      };
    }

    if (to.name === routeNames.login && userStore.isAuthenticated) {
      return { name: routeNames.tasks };
    }

    return true;
  });
}
