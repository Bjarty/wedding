import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig, loadEnv} from 'vite';
import {siteContent} from './src/content/siteContent';

const languageToken = '__SITE_LANGUAGE__';
const titleToken = '__SITE_TITLE__';
const rsvpTestProxyPrefix = '/rsvp-test-api';
const rsvpTestWorkerPattern = /^(?:rsvp-test|[a-f0-9]{8})-lisette-bjarty-rsvp-api-test\.[a-z0-9-]+\.workers\.dev$/u;

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const siteMetadataPlugin = {
  name: 'site-metadata',
  transformIndexHtml(html: string) {
    if (!html.includes(languageToken) || !html.includes(titleToken)) {
      throw new Error('index.html must contain the site metadata placeholders');
    }

    return html
      .replaceAll(languageToken, escapeHtml(siteContent.metadata.language))
      .replaceAll(titleToken, escapeHtml(siteContent.metadata.title));
  },
};

const readRsvpTestProxyTarget = (value: string | undefined): string | null => {
  if (value === undefined || value.trim() === '') return null;
  const url = new URL(value.trim());
  if (
    url.protocol !== 'https:' ||
    !rsvpTestWorkerPattern.test(url.hostname) ||
    url.port !== '' ||
    url.pathname !== '/' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('RSVP_TEST_PROXY_TARGET must be the isolated RSVP workers.dev preview alias');
  }
  return url.origin;
};

export default defineConfig(({mode}) => {
  const environment = loadEnv(mode, process.cwd(), '');
  const rsvpTestProxyTarget = readRsvpTestProxyTarget(environment.RSVP_TEST_PROXY_TARGET);

  return {
    base: '/',
    plugins: [siteMetadataPlugin, react(), tailwindcss()],
    server: rsvpTestProxyTarget === null ? undefined : {
      proxy: {
        [rsvpTestProxyPrefix]: {
          target: rsvpTestProxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(new RegExp(`^${rsvpTestProxyPrefix}`, 'u'), ''),
        },
      },
    },
  };
});
