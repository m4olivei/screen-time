import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter()
		}),
		SvelteKitPWA({
			// generateSW strategy (default); SW is registered from +layout.svelte via
			// the virtual:pwa-register module in production builds only.
			registerType: 'autoUpdate',
			injectRegister: false,
			manifest: {
				name: 'Screen Time',
				short_name: 'Screen Time',
				description: 'Household screen time manager',
				display: 'standalone',
				start_url: '/',
				scope: '/',
				theme_color: '#0f172a',
				background_color: '#0f172a',
				icons: [
					{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
					{
						src: '/icons/icon-maskable-192.png',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'maskable'
					},
					{
						src: '/icons/icon-maskable-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			workbox: {
				// Precache only the static app shell (build assets); the app is a live
				// dashboard, so pages and their data must always be fetched fresh-first.
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webmanifest,woff,woff2}'],
				runtimeCaching: [
					{
						// Navigations (document requests): network-first so status is never
						// served stale for long; short-lived cache as an offline fallback only.
						urlPattern: ({ request }) => request.mode === 'navigate',
						handler: 'NetworkFirst',
						options: {
							cacheName: 'pages',
							networkTimeoutSeconds: 5,
							expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 }
						}
					}
				]
			}
		})
	]
});
