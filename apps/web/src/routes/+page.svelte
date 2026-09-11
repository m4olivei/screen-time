<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import InfoIcon from '@lucide/svelte/icons/info';
	import * as Alert from '$lib/components/ui/alert';
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

	/**
	 * The extend strip opens on this value rather than at the far left, so
	 * +10/+15 are the pair in view on load. Starting mid-list also leaves a
	 * button peeking on both sides, which shows the strip scrolls either way.
	 */
	const LEAD_MINUTES = 10;

	/** Scroll an extend strip so LEAD_MINUTES is the leftmost fully visible button. */
	function openAtLead(node: HTMLElement) {
		const index = data.extendMinutes.indexOf(LEAD_MINUTES);
		const items = node.children;
		if (index < 1 || items.length <= index) return;
		node.scrollLeft =
			(items[index] as HTMLElement).offsetLeft - (items[0] as HTMLElement).offsetLeft;
	}

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
					<span aria-hidden="true">{profile.onSchedule ? '📅' : '⏱️'}</span>
					{possessive(profile.name)} internet:
					<span
						class={profile.state === 'ON'
							? 'text-green-600 dark:text-green-500'
							: 'text-red-600 dark:text-red-500'}>{profile.state}</span
					>{#if profile.untilLabel}&nbsp;until {profile.untilLabel}{/if}
				</Card.Title>
				{#if profile.resumeLabel}
					<Alert.Root variant="info" class="mt-3 has-data-[slot=alert-action]:pr-36">
						<InfoIcon />
						<Alert.Title>Override on</Alert.Title>
						<Alert.Description>Schedule resumes at {profile.resumeLabel}.</Alert.Description>
						<Alert.Action>
							<form method="POST" action="?/clearOverrides" use:enhance={submitOverride}>
								<input type="hidden" name="profileId" value={profile.id} />
								<Button type="submit" variant="outline" size="sm">Clear overrides</Button>
							</form>
						</Alert.Action>
					</Alert.Root>
				{/if}
			</Card.Header>
			<Card.Content>
				<form method="POST" use:enhance={submitOverride} class="flex flex-col gap-3">
					<input type="hidden" name="profileId" value={profile.id} />
					<!--
						Extend buttons: exactly two fit between the scroll padding, so the
						neighbours on either side peek out of that padding to the card edge
						and show which directions still have buttons. Negative margins let
						the strip span the card's full width; the card clips it.
					-->
					<div
						use:openAtLead
						class="-mx-(--card-spacing) flex snap-x snap-mandatory scroll-px-(--card-spacing) [scrollbar-width:none] gap-3 overflow-x-auto overscroll-x-contain px-(--card-spacing) [&::-webkit-scrollbar]:hidden"
					>
						{#each data.extendMinutes as minutes (minutes)}
							<Button
								type="submit"
								formaction="?/extend"
								name="minutes"
								value={minutes}
								size="lg"
								class="h-16 w-[calc((100%-0.75rem)/2)] shrink-0 snap-start text-lg font-semibold"
							>
								+{minutes} min
							</Button>
						{/each}
					</div>
					<div class="grid grid-cols-2 gap-3">
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
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/each}
</main>
