import type { RouteLocationNormalized, Router } from 'vue-router';

/**
 * Client-side SEO for the SPA.
 *
 * Static tags in index.html cover the initial HTML; this module updates the
 * title, description, canonical URL, robots directive and Open Graph/Twitter
 * tags after every navigation so each route has its own metadata.
 */

const APP_NAME = import.meta.env.VITE_APP_NAME || 'Todo';
const DEFAULT_DESCRIPTION =
  import.meta.env.VITE_APP_DESCRIPTION ||
  'Приложение для управления списком задач: добавление, поиск, фильтрация и настройки.';
const SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || '';
const DEFAULT_IMAGE = import.meta.env.VITE_OG_IMAGE || 'icons/favicon-128x128.png';
const ROUTER_BASE = import.meta.env.QUASAR_VUE_ROUTER_BASE || '/';

export interface PageMeta {
  title?: string;
  description: string;
  robots: string;
  image: string;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function siteBase(): string {
  if (SITE_URL !== '') {
    return ensureTrailingSlash(SITE_URL);
  }

  const origin = typeof window === 'undefined' ? 'https://localhost' : window.location.origin;

  return new URL(ROUTER_BASE, origin).href;
}

function absoluteUrl(path: string): string {
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) {
    return path;
  }

  return new URL(path.replace(/^\//, ''), siteBase()).href;
}

function setMeta(attribute: 'name' | 'property', key: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);

  if (element === null) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }

  element.setAttribute('content', content);
}

function setLink(rel: string, href: string): void {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);

  if (element === null) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    document.head.appendChild(element);
  }

  element.setAttribute('href', href);
}

export function resolvePageMeta(route: RouteLocationNormalized): PageMeta {
  return {
    ...(route.meta.title === undefined ? {} : { title: route.meta.title }),
    description: route.meta.description ?? DEFAULT_DESCRIPTION,
    robots: route.meta.robots ?? 'index,follow',
    image: route.meta.ogImage ?? DEFAULT_IMAGE,
  };
}

export function applyPageMeta(meta: PageMeta, path = '/'): void {
  if (typeof document === 'undefined') {
    return;
  }

  const title = meta.title === undefined ? APP_NAME : `${meta.title} | ${APP_NAME}`;
  const canonical = absoluteUrl(path);

  document.title = title;
  document.documentElement.lang = 'ru';

  setMeta('name', 'application-name', APP_NAME);
  setMeta('name', 'description', meta.description);
  setMeta('name', 'robots', meta.robots);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:site_name', APP_NAME);
  setMeta('property', 'og:locale', 'ru_RU');
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', meta.description);
  setMeta('property', 'og:url', canonical);
  setMeta('property', 'og:image', absoluteUrl(meta.image));
  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', meta.description);
  setMeta('name', 'twitter:image', absoluteUrl(meta.image));
  setLink('canonical', canonical);
}

export function applyRouteMeta(route: RouteLocationNormalized): void {
  // Canonical URLs must not contain query strings or hashes.
  applyPageMeta(resolvePageMeta(route), route.path);
}

/** Keeps document metadata in sync with the router. */
export function installSeo(router: Router): void {
  router.afterEach((to) => {
    applyRouteMeta(to);
  });

  void router.isReady().then(() => {
    applyRouteMeta(router.currentRoute.value);
  });
}
