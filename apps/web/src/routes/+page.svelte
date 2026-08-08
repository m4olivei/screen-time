<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import type { PageProps } from './$types.js';

	let { data }: PageProps = $props();

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
				<form method="POST" use:enhance class="grid grid-cols-2 gap-3">
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
