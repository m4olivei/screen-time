<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { PageProps } from './$types.js';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Schedule — Screen Time</title>
</svelte:head>

<main class="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 p-4 pt-8">
	<nav class="flex items-center gap-3">
		<Button href="/" variant="ghost" size="sm" class="-ml-2">&larr; Back to status</Button>
	</nav>

	<header class="flex flex-col gap-1">
		<h1 class="text-2xl font-bold tracking-tight">
			Weekly schedule{#if data.profile}&nbsp;&mdash; {data.profile.name}{/if}
		</h1>
		<p class="text-muted-foreground text-sm">
			Internet is ON during the windows below ({data.timeZone} time) and OFF outside them. A day with
			no windows means the internet is off that whole day.
		</p>
	</header>

	{#if form?.message}
		<div
			class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm font-medium"
			role="alert"
		>
			{form.message}
		</div>
	{/if}

	{#if !data.profile}
		<p class="text-muted-foreground">No profiles yet — add one to get started.</p>
	{:else}
		{#each data.days as day (day.dayOfWeek)}
			<Card.Root class="gap-3 py-4">
				<Card.Header class="px-4">
					<Card.Title class="text-base">{day.name}</Card.Title>
					{#if day.windows.length === 0}
						<Card.Description>No windows — internet is off all day.</Card.Description>
					{/if}
				</Card.Header>
				<Card.Content class="flex flex-col gap-2 px-4">
					{#each day.windows as window (window.id)}
						<form
							method="POST"
							action="?/update"
							use:enhance
							class="flex flex-wrap items-center gap-2"
						>
							<input type="hidden" name="windowId" value={window.id} />
							<Label class="sr-only" for="start-{window.id}">Start time</Label>
							<Input
								id="start-{window.id}"
								type="time"
								name="start"
								value={window.start}
								required
								class="w-28"
							/>
							<span class="text-muted-foreground text-sm">to</span>
							<Label class="sr-only" for="end-{window.id}">End time</Label>
							<Input
								id="end-{window.id}"
								type="time"
								name="end"
								value={window.end}
								required
								class="w-28"
							/>
							<Button type="submit" variant="secondary" size="sm">Save</Button>
							<Button type="submit" formaction="?/delete" variant="ghost" size="sm">Delete</Button>
						</form>
					{/each}

					<form
						method="POST"
						action="?/add"
						use:enhance
						class="flex flex-wrap items-center gap-2 border-t border-dashed pt-2"
					>
						<input type="hidden" name="profileId" value={data.profile.id} />
						<input type="hidden" name="dayOfWeek" value={day.dayOfWeek} />
						<Label class="sr-only" for="add-start-{day.dayOfWeek}">New window start time</Label>
						<Input id="add-start-{day.dayOfWeek}" type="time" name="start" required class="w-28" />
						<span class="text-muted-foreground text-sm">to</span>
						<Label class="sr-only" for="add-end-{day.dayOfWeek}">New window end time</Label>
						<Input id="add-end-{day.dayOfWeek}" type="time" name="end" required class="w-28" />
						<Button type="submit" size="sm">Add window</Button>
					</form>
				</Card.Content>
			</Card.Root>
		{/each}
	{/if}
</main>
