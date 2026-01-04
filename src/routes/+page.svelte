<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		goto('/test');
	});
</script>

<h1>posedown</h1>
<p>Redirecting to <a href="/test">/test</a>...</p>
