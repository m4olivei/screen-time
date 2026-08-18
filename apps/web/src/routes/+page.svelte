<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import type { PageProps, SubmitFunction } from './$types.js';

	let { data }: PageProps = $props();

	const REFRESH_INTERVAL_MS = 30 * 1000;

	// Background fetches (the poll below and use:enhance form posts) fail outright
	// once the Cloudflare Access session expires: Access answers with a redirect to
	// its login page on another origin, which CORS then blocks. A full navigation
	// would follow that redirect and show the login screen, so reload — otherwise
	// the poll dies silently on stale data and the override buttons land on a
	// "Failed to fetch" error page. Only once per page load, so a plain network
	// outage doesn't turn into a reload every tick.
	let recovering = false;
	function recoverFromFailedFetch() {
		if (recovering) return;
		recovering = true;
		location.reload();
	}

	// Status and button labels are computed at render time, so a page left open
	// (or a PWA resumed from the background) can show stale state: refresh when
	// the app returns to the foreground, and poll gently while visible.
	onMount(() => {
		const refreshIfVisible = () => {
			if (document.visibilityState === 'visible') invalidateAll().catch(recoverFromFailedFetch);
		};
		document.addEventListener('visibilitychange', refreshIfVisible);
		const interval = setInterval(refreshIfVisible, REFRESH_INTERVAL_MS);
		return () => {
			document.removeEventListener('visibilitychange', refreshIfVisible);
			clearInterval(interval);
		};
	});

	const submitOverride: SubmitFunction = () => {
		return async ({ result, update }) => {
			// 'error' here means the POST itself never completed (see above); action
			// failures come back as 'failure' and should render normally.
			if (result.type === 'error') {
				recoverFromFailedFetch();
				return;
			}
			await update();
		};
	};

	/** "Kids" → "Kids'", "Ana" → "Ana's" — for the "Kids' internet" headline. */
	function possessive(name: string): string {
		return name.endsWith('s') ? `${name}'` : `${name}'s`;
	}
</script>

<svelte:head>
	<title>Screen Time</title>
</svelte:head>

<main class="mx-auto flex min-h-screen w-full max-w-md flex-col gap-5 p-4 pt-8">
	<nav class="flex items-center justify-between gap-3">
		<h1 class="text-2xl font-bold tracking-tight">Screen Time</h1>
		<Button href="/schedule" variant="outline" size="sm">Edit schedule</Button>
	</nav>

	{#if data.profiles.length === 0}
		<p class="text-muted-foreground">No profiles yet — add one to get started.</p>
	{/if}

	{#each data.profiles as profile (profile.id)}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-xl leading-snug">
					{possessive(profile.name)} internet:
					<span
						class={profile.state === 'ON'
							? 'text-green-600 dark:text-green-500'
							: 'text-red-600 dark:text-red-500'}>{profile.state}</span
					>{#if profile.untilLabel}&nbsp;until {profile.untilLabel}{/if}
				</Card.Title>
				<Card.Description>Changes take effect within seconds.</Card.Description>
			</Card.Header>
			<Card.Content>
				<form method="POST" use:enhance={submitOverride} class="grid grid-cols-2 gap-3">
					<input type="hidden" name="profileId" value={profile.id} />
					<Button
						type="submit"
						formaction="?/extend15"
						size="lg"
						class="h-16 text-lg font-semibold"
					>
						+15 min
					</Button>
					<Button type="submit" formaction="?/extend5" size="lg" class="h-16 text-lg font-semibold">
						+5 min
					</Button>
					<Button
						type="submit"
						formaction="?/pauseNow"
						variant="destructive"
						size="lg"
						class="h-16 flex-col gap-0 text-lg font-semibold"
					>
						Pause
						<span class="text-xs font-normal opacity-80">{profile.horizonLabel}</span>
					</Button>
					<Button
						type="submit"
						formaction="?/allowNow"
						variant="secondary"
						size="lg"
						class="h-16 flex-col gap-0 text-lg font-semibold"
					>
						Allow
						<span class="text-xs font-normal opacity-80">{profile.horizonLabel}</span>
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{/each}
</main>
