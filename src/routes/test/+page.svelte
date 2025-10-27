<script lang="ts">
	import { marked, type Token } from 'marked'
	import { configureMarkedTokenizer } from '../../post/[slug]/edit/marked-utils'
	import TextBlockEditor from '../../post/[slug]/edit/components/TextBlockEditor.svelte'

	// Configure marked the same way the editor does
	configureMarkedTokenizer()

	let initialContent = '# Hello World\n\nThis is a test paragraph.\n\n## Subheading\n\nAnother paragraph here.\n\n### Third heading\n\nFinal paragraph.'

	let content = $state(initialContent)

	// Parse content for comparison display
	let debugTokens = $derived.by(() => {
		try {
			const tokens = marked.lexer(content)
			return tokens.length > 0 ? tokens : []
		} catch {
			return []
		}
	})

	const handleUpdate = (newContent: string) => {
		content = newContent
	}

	const getTokenTypeColor = (type: string): string => {
		switch (type) {
			case 'heading':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
			case 'paragraph':
				return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
			case 'code':
				return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
			case 'list':
				return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
			case 'blockquote':
				return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
			case 'space':
				return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
			default:
				return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
		}
	}

	const getTokenLabel = (token: Token): string => {
		if (token.type === 'heading') {
			return `H${(token as any).depth}`
		}
		return token.type
	}
</script>

<div class="mx-auto max-w-6xl space-y-6 p-6">
	<header class="mb-8">
		<h1 class="mb-2 text-3xl font-bold">Text Block Editor Test</h1>
		<p class="text-sm text-muted-foreground">
			Testing the new text-based BlockEditor with native browser UX.
		</p>
	</header>

	<!-- Text Block Editor (New Implementation) -->
	<div class="rounded-lg border-2 border-primary bg-card p-4">
		<div class="mb-3 flex items-center gap-2">
			<h2 class="text-lg font-semibold">Text Block Editor (New)</h2>
			<span class="rounded bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
				Text-Based Architecture
			</span>
		</div>
		<TextBlockEditor {content} disabled={false} onUpdate={handleUpdate} />
	</div>

	<!-- Comparison with old BlockEditor -->
	<div class="rounded-lg border bg-muted/30 p-4">
		<h2 class="mb-3 text-lg font-semibold">Compare with Original</h2>
		<p class="text-sm text-muted-foreground">
			The original block-based editor is at <a
				href="/test/hybrid-editor"
				class="text-primary underline">"/test/hybrid-editor"</a
			>
		</p>
		<div class="mt-3 space-y-2 text-sm">
			<div class="flex gap-2">
				<span class="font-semibold">Text-based:</span>
				<span>Single textarea, native UX, auto undo/redo/copy/paste</span>
			</div>
			<div class="flex gap-2">
				<span class="font-semibold">Block-based:</span>
				<span>Multiple textareas, manual focus management, custom navigation</span>
			</div>
		</div>
	</div>

	<!-- Token Visualization (Full Debug) -->
	<div class="rounded-lg border bg-muted/50 p-4">
		<h2 class="mb-3 text-lg font-semibold">All Tokens (Including Spaces)</h2>
		<div class="space-y-3">
			{#each debugTokens as token, idx}
				<div
					class={token.type == 'space'
						? 'rounded border border-dashed bg-background/50 p-2'
						: 'rounded-lg border bg-card p-3'}
				>
					<div class="mb-2 flex items-center gap-2">
						<span
							class={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getTokenTypeColor(token.type)}`}
						>
							{getTokenLabel(token)}
						</span>
						<span class="text-xs text-muted-foreground">Token {idx}</span>
					</div>
					<pre class="text-xs text-muted-foreground">{token.raw || '(empty)'}</pre>
				</div>
			{/each}
		</div>
	</div>

	<!-- Raw Markdown Output -->
	<div class="rounded-lg border bg-muted/50 p-4">
		<h2 class="mb-3 text-lg font-semibold">Raw Markdown Output</h2>
		<pre class="overflow-x-auto rounded bg-background p-4 text-sm">{content}</pre>
	</div>

	{#if debugTokens.length > 0}
		<!-- Debug Info -->
		<details class="rounded-lg border bg-muted/30 p-4">
			<summary class="cursor-pointer font-semibold">Debug: Token Objects</summary>
			<pre class="mt-2 overflow-x-auto rounded bg-background p-4 text-xs">{JSON.stringify(
					debugTokens.map((token: Token, idx: number) => ({
						index: idx,
						type: token.type,
						raw: token.raw,
						text: (token as any).text,
						depth: (token as any).depth
					})),
					null,
					2
				)}</pre>
		</details>
	{/if}
</div>
