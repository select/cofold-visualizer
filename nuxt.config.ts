const baseURL = process.env.NUXT_APP_BASE_URL || '/'
const siteUrl = 'https://select.github.io/cofold-visualizer'
const siteTitle = 'Co-Fold Visualized · OpenFold3'
const siteDescription = 'An interactive 3D walkthrough of the OpenFold3 co-folding architecture.'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: true,

  typescript: {
    typeCheck: false,
    tsConfig: {
      compilerOptions: {
        strict: true,
        useUnknownInCatchVariables: true,
      },
    },
  },

  modules: ['@unocss/nuxt', '@pinia/nuxt', '@vueuse/nuxt', '@nuxt/eslint'],

  css: ['~/assets/css/notion.css'],

  app: {
    head: {
      title: siteTitle,
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: `${baseURL}favicon.svg` },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: `${baseURL}favicon-32x32.png` },
        { rel: 'apple-touch-icon', sizes: '180x180', href: `${baseURL}apple-touch-icon.png` },
      ],
      meta: [
        { name: 'description', content: siteDescription },
        { name: 'theme-color', content: '#131316' },
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: siteTitle },
        { property: 'og:description', content: siteDescription },
        { property: 'og:url', content: `${siteUrl}/` },
        { property: 'og:image', content: `${siteUrl}/og-image.png` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: siteTitle },
        { name: 'twitter:description', content: siteDescription },
        { name: 'twitter:image', content: `${siteUrl}/og-image.png` },
      ],
      script: [
        {
          innerHTML: `
            (function() {
              try {
                var theme = localStorage.getItem('cofold-theme');
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                  document.documentElement.style.backgroundColor = '#191919';
                } else {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.style.backgroundColor = '#ffffff';
                }
              } catch (e) {}
            })();
          `,
          type: 'text/javascript',
        },
      ],
      style: [
        {
          innerHTML: `
            html {
              background-color: inherit;
            }
            body {
              margin: 0;
              padding: 0;
              background-color: inherit;
            }
          `,
        },
      ],
    },
  },
})
