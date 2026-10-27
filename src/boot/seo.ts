import { defineBoot } from '#q-app';
import { installSeo } from '@/services/seo';

/**
 * Updates title, description, canonical, robots and Open Graph tags after
 * every route change. Static defaults live in index.html.
 */
export default defineBoot(({ router }) => {
  installSeo(router);
});
