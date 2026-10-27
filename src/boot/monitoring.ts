import { defineBoot } from '#q-app';
import { watch } from 'vue';
import { initMonitoring, monitoring, reportWebVitals } from '@/services/monitoring';
import { useUserStore } from '@/stores/userStore';
import { subscribeToErrorReports } from '@/utils/errorHandling';

const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

/**
 * Connects the monitoring facade to the application:
 * - errors from the central pipeline,
 * - navigation timings,
 * - Core Web Vitals,
 * - the current user (id/name/email only).
 */
export default defineBoot(({ router, store }) => {
  initMonitoring();

  subscribeToErrorReports((report) => {
    monitoring.captureErrorReport(report);
  });

  reportWebVitals((metric) => {
    monitoring.captureMetric(metric);
  });

  const userStore = useUserStore(store);

  watch(
    () => userStore.currentUser,
    (user) => {
      monitoring.setUser(
        user === null ? null : { id: user.id, name: user.name, email: user.email },
      );
    },
    { immediate: true },
  );

  let navigationStartedAt = now();

  router.beforeEach(() => {
    navigationStartedAt = now();
    return true;
  });

  router.afterEach((to, from) => {
    monitoring.trackNavigation(to.fullPath, from.fullPath, now() - navigationStartedAt);
  });

  window.addEventListener(
    'pagehide',
    () => {
      void monitoring.flush();
    },
    { once: true },
  );
});
