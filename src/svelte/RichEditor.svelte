<script lang="ts">
	import { renderWithAttributes } from '$lib/utils/marked/attributes'
	import { RichEditorState } from './richEditorState.svelte'
	import { markdownToHtml, markdownToHast, parseMarkdownToMdast } from './ast-utils'

	// Configure marked to use attribute rendering
	renderWithAttributes()

	let {
		content = '',
		onUpdate
	}: {
		content?: string
		onUpdate: (newContent: string) => void
	} = $props()

	let editorState = new RichEditorState(content)

	// Update editor state when content prop changes
	$effect(() => {
		editorState.rawMd = content
		if (editorState.editableRef) {
			const html = markdownToHtml(content)
			editorState.editableRef.innerHTML = html
			hast = markdownToHast(content)
			mdast = parseMarkdownToMdast(content)
		}
	})

	const handleInput = (e: Event) => {
		const target = e.target as HTMLTextAreaElement
		editorState.rawMd = target.value
		// onUpdate(editorState.rawMd)
	}

	// Testing: Convert markdown → HTML and update contentEditable
	let hast = $state(markdownToHast(content))
	let mdast = $state(parseMarkdownToMdast(content))

	const updateFromMarkdown = () => {
		if (editorState.editableRef) {
			const html = markdownToHtml(editorState.rawMd)
			editorState.editableRef.innerHTML = html
			hast = markdownToHast(editorState.rawMd)
			mdast = parseMarkdownToMdast(editorState.rawMd)
		}
	}
</script>

<div class="space-y-4">
	<!-- Test button: Convert markdown → HTML -->
	<button
		onclick={updateFromMarkdown}
		class="rounded border border-primary bg-primary/10 px-4 py-2 text-sm font-medium hover:bg-primary/20"
	>
		Test: Update ContentEditable from Markdown
	</button>

	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
		<textarea
			value={editorState.rawMd}
			oninput={handleInput}
			class="w-full rounded border bg-background p-3 font-mono text-sm"
			rows="20"
		></textarea>

		<div class="space-y-4">
			<div class="overflow-x-auto rounded border bg-card p-3">
				<pre class="text-xs">{editorState.editableRef?.innerHTML}</pre>
			</div>

			<div
				bind:this={editorState.editableRef}
				role="article"
				contenteditable={editorState.editableRef ? "true": "false"}
				class="prose prose-sm max-w-none rounded border p-3 whitespace-break-spaces dark:prose-invert"
			>
				{@html editorState.html}
			</div>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
		<div class="space-y-2">
			<h3 class="text-sm font-semibold">MDAST (Markdown AST)</h3>
			<div class="overflow-x-auto rounded border bg-muted/50 p-3">
				<pre class="text-xs">{JSON.stringify(mdast, null, 2)}</pre>
			</div>
		</div>
		<div class="space-y-2">
			<h3 class="text-sm font-semibold">HAST (HTML AST)</h3>
			<div class="overflow-x-auto rounded border bg-muted/50 p-3">
				<pre class="text-xs">{JSON.stringify(hast, null, 2)}</pre>
			</div>
		</div>
	</div>
</div>
