import { computed, type ComputedRef } from 'vue';
import { useRoute, type RouteLocationRaw } from 'vue-router';

export interface BreadcrumbLink {
  label: string;
  to: RouteLocationRaw;
}

/** Builds the breadcrumb trail from the matched route records. */
export function useBreadcrumbs(): ComputedRef<BreadcrumbLink[]> {
  const route = useRoute();

  return computed((): BreadcrumbLink[] => {
    return route.matched.flatMap((record): BreadcrumbLink[] => {
      const label = record.meta.breadcrumb;

      if (typeof label !== 'string' || label.length === 0) {
        return [];
      }

      const to: RouteLocationRaw = record.name
        ? { name: record.name }
        : { path: record.path.length > 0 ? record.path : '/' };

      return [{ label, to }];
    });
  });
}
