<script lang="ts">
	import { RichEditorState } from './richEditorState.svelte'
	import { markdownToHtml, markdownToHast, parseMarkdownToMdast } from '$lib/core/transforms/ast-utils'

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

<style>
	.container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.button {
		padding: 0.5rem 1rem;
		border: 1px solid #999;
		background: #f0f0f0;
		cursor: pointer;
		width: fit-content;
	}

	.button:hover {
		background: #e0e0e0;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	textarea {
		width: 100%;
		padding: 0.5rem;
		border: 1px solid #ccc;
		font-family: monospace;
		resize: vertical;
		box-sizing: border-box;
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 0;
	}

	.preview {
		overflow: auto;
		padding: 0.5rem;
		border: 1px solid #ccc;
		background: #f9f9f9;
		font-size: 0.75rem;
		min-width: 0;
	}

	.preview pre {
		margin: 0;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.editor {
		padding: 0.5rem;
		border: 1px solid #ccc;
		min-height: 200px;
		min-width: 0;
		box-sizing: border-box;
		white-space: break-spaces;
	}

	/* FocusMarks: Styling for dynamically injected markdown delimiter spans */
	:global(.pd-focus-mark) {
		color: #888;
		font-family: 'Courier New', Consolas, monospace;
		font-size: 0.9em;
		opacity: 0.7;
		user-select: auto; /* User can select and edit */
		pointer-events: auto;
	}

	/* Ensure marks don't inherit parent formatting */
	:global(strong > .pd-focus-mark),
	:global(em > .pd-focus-mark),
	:global(code > .pd-focus-mark),
	:global(s > .pd-focus-mark),
	:global(del > .pd-focus-mark) {
		font-weight: normal;
		font-style: normal;
		text-decoration: none;
	}

	.ast {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
	}

	.ast h3 {
		font-size: 0.875rem;
		margin: 0;
	}

	.ast-content {
		overflow: auto;
		padding: 0.5rem;
		border: 1px solid #ccc;
		background: #f5f5f5;
		font-size: 0.75rem;
		min-width: 0;
	}

	.ast-content pre {
		margin: 0;
	}
</style>

<div class="container">
	<button onclick={updateFromMarkdown} class="button">
		Test: Update ContentEditable from Markdown
	</button>

	<div class="grid">
		<textarea
			value={editorState.rawMd}
			oninput={handleInput}
			rows="20"
		></textarea>

		<div class="panel">
			<div class="preview">
				<pre>{editorState.editableRef?.innerHTML}</pre>
			</div>

			<div
				bind:this={editorState.editableRef}
				role="article"
				contenteditable={editorState.editableRef ? "true": "false"}
				class="editor"
			>
				{@html editorState.html}
			</div>
		</div>
	</div>

	<div class="grid">
		<div class="ast">
			<h3>MDAST (Markdown AST)</h3>
			<div class="ast-content">
				<pre>{JSON.stringify(mdast, null, 2)}</pre>
			</div>
		</div>
		<div class="ast">
			<h3>HAST (HTML AST)</h3>
			<div class="ast-content">
				<pre>{JSON.stringify(hast, null, 2)}</pre>
			</div>
		</div>
	</div>
</div>
