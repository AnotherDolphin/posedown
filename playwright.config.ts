import { defineConfig } from '@playwright/test'

export default defineConfig({
	webServer: {
		// command: 'npm run build && npm run preview',
		// port: 4173
		command: 'npm run dev',
		port: 5173,
		reuseExistingServer: true
	},
	testDir: 'src/lib/rich/tests/e2e'
})
