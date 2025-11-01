<script lang="ts">
	import { configureMarkedTokenizer } from '../../post/[slug]/edit/marked-utils'
	import TextBlockEditor from '../../post/[slug]/edit/components/TextBlockEditor.svelte'
	import RichEditor from '$lib/rich/RichEditor.svelte'

	// Configure marked the same way the editor does
	configureMarkedTokenizer()

	// Example from the plan document
	let initialContent = 'This is **bold and _italic_** text'

	let content = $state(initialContent)

	const handleUpdate = (newContent: string) => {
		content = newContent
	}

	const examples = [
		{
			name: 'Simple Bold & Italic',
			content: 'This is **bold and _italic_** text'
		},
		{
			name: 'Heading with Formatting',
			content: '# Hello **World**\n\nThis is a paragraph with _italic_ text.'
		},
		{
			name: 'Complex Nesting',
			content: 'Text with **bold and _nested italic_ and more bold** here.'
		},
		{
			name: 'Multiple Paragraphs',
			content: '# Title\n\nFirst paragraph with **bold**.\n\nSecond paragraph with _italic_.'
		},
		{
			name: 'List Example',
			content: '# Todo List\n\n- Item one\n- Item **two** with bold\n- Item _three_ with italic'
		}
	]

	function loadExample(exampleContent: string) {
		content = exampleContent
	}
</script>

<div class="mx-auto max-w-7xl space-y-6 p-6">
	<div class="flex gap-2">
		{#each examples as example}
			<button
				onclick={() => loadExample(example.content)}
				class="rounded border px-3 py-1 text-sm hover:bg-muted"
			>
				{example.name}
			</button>
		{/each}
	</div>

	<!-- <TextBlockEditor {content} onUpdate={handleUpdate} /> -->
	 <RichEditor {content} onUpdate={handleUpdate} />
</div>
