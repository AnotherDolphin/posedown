<script lang="ts">
	import { RichEditor } from '$lib/svelte'

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
			content: 'Text with **bold and _nested italic_ and more bold** here and **here**.'
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

<style>
	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
		font-family: system-ui, -apple-system, sans-serif;
	}

	h1 {
		font-size: 2rem;
		font-weight: 700;
		margin-bottom: 1.5rem;
		color: #1f2937;
	}

	.buttons {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}

	button {
		padding: 0.5rem 1rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		background: white;
		font-size: 0.875rem;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	button:hover {
		background-color: #f3f4f6;
	}
</style>

<div class="container">
	<h1>posedown - Rich Text Editor Test</h1>

	<div class="buttons">
		{#each examples as example}
			<button onclick={() => loadExample(example.content)}>
				{example.name}
			</button>
		{/each}
	</div>

	<RichEditor {content} onUpdate={handleUpdate} />
</div>
