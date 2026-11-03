// @ts-check
import { defineConfig, passthroughImageService } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import starlight from '@astrojs/starlight';
import { GITHUB, buildSidebar, guideDirFromSite } from './src/lib/guide.mjs';
import guideWatch from './src/lib/guide-watch.mjs';
import remarkGuide from './src/plugins/remark-guide.mjs';

export default defineConfig({
  // Static output only; nothing here needs a server.
  output: 'static',
  trailingSlash: 'ignore',
  // No image optimisation: the site has a handful of SVGs and no native image dependency.
  image: { service: passthroughImageService() },
  // No telemetry from the dev toolbar, no external requests.
  devToolbar: { enabled: false },
  markdown: {
    // The remark pipeline, so the guide pages can use ordinary remark plugins.
    processor: unified({ remarkPlugins: [remarkGuide] }),
  },
  integrations: [
    guideWatch(),
    starlight({
      title: 'ts-bin-rpc',
      description:
        'Code-first TypeScript RPC with a binary wire format, lazy zero-copy views and typed-array columns.',
      logo: { src: './src/assets/logo.svg', alt: '' },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: GITHUB }],
      // entry.filePath is relative to site/ (`../docs/guide/types.md`), the URL resolves the `..`.
      editLink: { baseUrl: `${GITHUB}/edit/main/site/` },
      sidebar: buildSidebar(),
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      lastUpdated: false,
      credits: false,
      disable404Route: true,
      markdown: { processedDirs: [guideDirFromSite] },
      customCss: [
        '@fontsource-variable/geist/wght.css',
        '@fontsource-variable/geist-mono/wght.css',
        './src/styles/theme.css',
        './src/styles/docs.css',
      ],
      components: {
        Header: './src/components/Header.astro',
        Hero: './src/components/Hero.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
        PageTitle: './src/components/PageTitle.astro',
      },
      expressiveCode: {
        themes: ['vitesse-dark', 'vitesse-light'],
        styleOverrides: {
          borderRadius: '0.625rem',
          borderColor: 'var(--tbr-border)',
          borderWidth: '1px',
          codeBackground: 'var(--tbr-code-bg)',
          codeFontFamily: 'var(--__sl-font-mono)',
          codeFontSize: '0.8125rem',
          codeLineHeight: '1.7',
          codePaddingBlock: '0.875rem',
          codePaddingInline: '1.125rem',
          uiFontFamily: 'var(--__sl-font)',
          uiFontSize: '0.8125rem',
          scrollbarThumbColor: 'var(--tbr-scrollbar)',
          scrollbarThumbHoverColor: 'var(--tbr-scrollbar-hover)',
          frames: {
            shadowColor: 'transparent',
            frameBoxShadowCssValue: 'none',
            editorBackground: 'var(--tbr-code-bg)',
            editorTabBarBackground: 'var(--tbr-code-chrome)',
            editorTabBarBorderBottomColor: 'var(--tbr-border)',
            editorActiveTabBackground: 'var(--tbr-code-bg)',
            editorActiveTabForeground: 'var(--sl-color-white)',
            editorActiveTabBorderColor: 'transparent',
            editorActiveTabIndicatorTopColor: 'transparent',
            editorActiveTabIndicatorBottomColor: 'var(--tbr-accent-line)',
            editorTabBorderRadius: '0',
            terminalBackground: 'var(--tbr-code-bg)',
            terminalTitlebarBackground: 'var(--tbr-code-chrome)',
            terminalTitlebarBorderBottomColor: 'var(--tbr-border)',
            terminalTitlebarForeground: 'var(--sl-color-gray-3)',
            terminalTitlebarDotsForeground: 'var(--tbr-dots)',
            terminalTitlebarDotsOpacity: '1',
            inlineButtonBackground: 'var(--sl-color-gray-5)',
            inlineButtonBorder: 'var(--tbr-border)',
            inlineButtonForeground: 'var(--sl-color-gray-2)',
            tooltipSuccessBackground: 'var(--tbr-accent-solid)',
            tooltipSuccessForeground: 'var(--tbr-on-accent)',
          },
        },
      },
    }),
  ],
});
