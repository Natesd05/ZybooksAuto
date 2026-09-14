import { defineConfig } from 'wxt';
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ mode }) => ({
    name: mode === 'fixture' ? 'ZyFlow • Fixture Lab' : 'ZyFlow',
    description:
      'A cancellable participation runner for supported zyBooks animations and single-choice widgets.',
    minimum_chrome_version: '116',
    permissions: ['sidePanel', 'storage', 'webNavigation'],
    host_permissions:
      mode === 'fixture'
        ? ['https://learn.zybooks.com/*', 'http://localhost/*']
        : ['https://learn.zybooks.com/*'],
    action: { default_title: 'Open ZyFlow' },
    icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
  }),
});
