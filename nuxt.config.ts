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
      title: 'Co-Fold Visualized · OpenFold3',
      meta: [
        {
          name: 'description',
          content:
            'An interactive 3D, Notion-style walkthrough of the OpenFold3 co-folding architecture.',
        },
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
