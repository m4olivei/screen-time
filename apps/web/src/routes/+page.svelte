<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { SHARED_PACKAGE_NAME } from '@screen-time/shared';
</script>

<main class="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8">
	<h1 class="text-3xl font-bold tracking-tight">Screen Time</h1>
	<p class="text-muted-foreground">
		Household screen time manager scaffold (shared package: {SHARED_PACKAGE_NAME})
	</p>
	<Button>It works</Button>
</main>
