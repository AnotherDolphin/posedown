import tailwindcss from '@tailwindcss/vite'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	optimizeDeps: {
		include: [
			'firebase/app',
			'firebase/auth',
			'firebase/firestore',
			'firebase/storage'
		],
		exclude: ['@lucide/svelte']
	},
	ssr: {
		noExternal: ['bits-ui']
	}
})
