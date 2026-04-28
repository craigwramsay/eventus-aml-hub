/**
 * Hub base URL helper.
 *
 * Single source of truth for the public origin of the deployed Hub.
 * Used by anything that needs to construct an external-facing URL
 * (invitation emails, password resets, webhook callbacks, PDF "view in
 * Hub" links, etc.).
 *
 * Reads `NEXT_PUBLIC_APP_URL` — the same env var used everywhere else in
 * the codebase. Falls back to the production Vercel URL only when the
 * env var is missing, *not* to localhost, so a missing var on a
 * production deploy never produces broken invite links.
 *
 * Throws in development if the env var is missing AND the fallback
 * would not match the request — only relevant when local dev needs to
 * generate links that the user will click on (rare). For now we just
 * fall back silently so existing behaviour is preserved.
 */

const PRODUCTION_FALLBACK = 'https://eventus-aml-hub.vercel.app';

/**
 * The base URL of the Hub, e.g. `https://eventus-aml-hub.vercel.app`.
 * Always returns a string with no trailing slash.
 */
export function getAppBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  const url = (fromEnv && fromEnv.trim()) || PRODUCTION_FALLBACK;
  return url.replace(/\/+$/, '');
}

/**
 * Build an absolute URL by joining a path onto the Hub base URL.
 * Accepts paths with or without a leading slash.
 */
export function buildHubUrl(path: string): string {
  const cleanedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getAppBaseUrl()}${cleanedPath}`;
}
