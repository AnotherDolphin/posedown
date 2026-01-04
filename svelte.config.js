import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter()
	},

	package: {
		// Export subdirectories
		exports: (filepath) => {
			// Export core/ and svelte/ subdirectories
			if (filepath.startsWith('core/')) return true;
			if (filepath.startsWith('svelte/')) return true;
			// Export root index
			return filepath === 'index.ts';
		},

		// Exclude test files
		files: (filepath) => {
			return !filepath.includes('.test.') && !filepath.includes('.spec.');
		}
	}
};

export default config;
