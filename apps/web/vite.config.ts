import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
	ssr: {
		// Import the shared package at runtime instead of bundling it: bundling
		// would inline TypeORM, whose require('better-sqlite3') then can't resolve
		// from apps/web/build under pnpm's strict node_modules layout.
		external: ['@screen-time/shared']
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-node emits a standalone server to build/ (run with `node build`,
			// listens on PORT, default 3000) so the Pi only needs production deps.
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
							expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 },
							plugins: [
								{
									// Navigation requests use redirect: 'manual' inside a service
									// worker, so an expired Cloudflare Access session comes back as
									// an opaque redirect (status 0) — which NetworkFirst's default
									// cacheOkAndOpaquePlugin would happily store and later serve as
									// the offline fallback. Cache real responses only.
									cacheWillUpdate: async ({ response }) =>
										response.status === 200 && !response.redirected ? response : null
								}
							]
						}
					}
				]
			}
		})
	]
});
