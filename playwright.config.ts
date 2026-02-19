import { defineConfig } from '@playwright/test'
import { readFileSync } from 'fs'

try {
	for (const line of readFileSync(new URL('.env', import.meta.url), 'utf-8').split('\n')) {
		const eq = line.indexOf('=')
		if (eq === -1) continue
		const key = line.slice(0, eq).trim()
		const val = line.slice(eq + 1).trim()
		if (key && !key.startsWith('#') && !(key in process.env)) process.env[key] = val
	}
} catch {}

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
