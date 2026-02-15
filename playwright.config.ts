import { defineConfig } from '@playwright/test'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173'

export default defineConfig({
	use: {
		baseURL: BASE_URL
	},
	webServer: {
		// command: 'npm run build && npm run preview',
		// port: 4173
		command: 'npm run dev',
		url: BASE_URL,
		reuseExistingServer: true
	},
	testDir: 'tests/e2e'
})
