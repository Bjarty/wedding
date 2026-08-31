import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import {siteContent} from './src/content/siteContent';

const languageToken = '__SITE_LANGUAGE__';
const titleToken = '__SITE_TITLE__';

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

export default defineConfig({
  base: '/',
  plugins: [siteMetadataPlugin, react(), tailwindcss()],
});
