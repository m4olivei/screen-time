import { fail } from '@sveltejs/kit';
import {
	computeDesiredState,
	computeExtendAnchor,
	computeNextTransition,
	createOverride,
	extendOverride,
	getActiveOverrides,
	getAllProfiles,
	getScheduleWindows,
	type OverrideType
} from '@screen-time/shared';
import { getDataSource } from '$lib/server/db.js';
import { TIMEZONE } from '$lib/server/env.js';
import type { Actions, PageServerLoad } from './$types.js';

/** Pause/Allow horizon when the schedule has no upcoming transition. */
const FALLBACK_HORIZON_MS = 3 * 60 * 60 * 1000; // 3 hours
const MINUTE_MS = 60 * 1000;

const timeFormatter = new Intl.DateTimeFormat('en-US', {
	timeZone: TIMEZONE,
	hour: 'numeric',
	minute: '2-digit'
});
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
	timeZone: TIMEZONE,
	dateStyle: 'short'
});
const weekdayTimeFormatter = new Intl.DateTimeFormat('en-US', {
	timeZone: TIMEZONE,
	weekday: 'short',
	hour: 'numeric',
	minute: '2-digit'
});

/** "8:00 PM" today, "Thu 8:00 PM" on another day — always in the household TZ. */
function formatInstant(instant: Date, now: Date): string {
	return dayKeyFormatter.format(instant) === dayKeyFormatter.format(now)
		? timeFormatter.format(instant)
		: weekdayTimeFormatter.format(instant);
}

/**
 * Fixed horizon for Pause now / Allow now: the next SCHEDULE transition
 * (windows only — deliberately ignoring overrides so the horizon is a stable,
 * explainable moment), or now + 3 hours when the schedule never changes within
 * the lookahead. The button labels surface exactly this behavior.
 */
function forceHorizon(now: Date, windows: Awaited<ReturnType<typeof getScheduleWindows>>): Date {
	const nextScheduleChange = computeNextTransition({
		now,
		timeZone: TIMEZONE,
		windows,
		overrides: []
	});
	return nextScheduleChange ?? new Date(now.getTime() + FALLBACK_HORIZON_MS);
}

export const load: PageServerLoad = async () => {
	const dataSource = await getDataSource();
	const now = new Date();
	const profiles = await getAllProfiles(dataSource);

	const profileStatuses = [];
	for (const profile of profiles) {
		const windows = await getScheduleWindows(dataSource, profile.id);
		const overrides = await getActiveOverrides(dataSource, profile.id, now);
		const input = { now, timeZone: TIMEZONE, windows, overrides };

		const state = computeDesiredState(input);
		const until = computeNextTransition(input);
		const scheduleChange = computeNextTransition({ ...input, overrides: [] });

		profileStatuses.push({
			id: profile.id,
			name: profile.name,
			state,
			until: until ? until.toISOString() : null,
			untilLabel: until ? formatInstant(until, now) : null,
			// What Pause/Allow will do right now, surfaced on the buttons.
			horizonLabel: scheduleChange ? `until ${formatInstant(scheduleChange, now)}` : 'for 3 hours'
		});
	}

	return { profiles: profileStatuses, timeZone: TIMEZONE };
};

async function readProfileId(request: Request): Promise<number | null> {
	const form = await request.formData();
	const profileId = Number(form.get('profileId'));
	return Number.isInteger(profileId) && profileId > 0 ? profileId : null;
}

/**
 * +15/+5: create-or-extend. If an active `extend` override exists, push its
 * `effectiveUntil` N minutes further; otherwise create one anchored at the
 * current cutoff (shared `computeExtendAnchor`: next transition when ON, now
 * when OFF).
 */
async function applyExtend(request: Request, minutes: number) {
	const profileId = await readProfileId(request);
	if (profileId === null) return fail(400, { message: 'Missing profile' });

	const dataSource = await getDataSource();
	const now = new Date();
	const overrides = await getActiveOverrides(dataSource, profileId, now);
	const activeExtend = overrides.find((override) => override.type === 'extend');

	if (activeExtend) {
		await extendOverride(
			dataSource,
			activeExtend.id,
			new Date(activeExtend.effectiveUntil.getTime() + minutes * MINUTE_MS)
		);
	} else {
		const windows = await getScheduleWindows(dataSource, profileId);
		const anchor = computeExtendAnchor({ now, timeZone: TIMEZONE, windows, overrides });
		await createOverride(dataSource, {
			profileId,
			type: 'extend',
			effectiveUntil: new Date(anchor.getTime() + minutes * MINUTE_MS)
		});
	}
	return { success: true };
}

/** Pause now / Allow now: force OFF/ON until the next schedule change (or 3h). */
async function applyForce(request: Request, type: OverrideType) {
	const profileId = await readProfileId(request);
	if (profileId === null) return fail(400, { message: 'Missing profile' });

	const dataSource = await getDataSource();
	const now = new Date();
	const windows = await getScheduleWindows(dataSource, profileId);
	await createOverride(dataSource, {
		profileId,
		type,
		effectiveUntil: forceHorizon(now, windows)
	});
	return { success: true };
}

export const actions: Actions = {
	extend15: ({ request }) => applyExtend(request, 15),
	extend5: ({ request }) => applyExtend(request, 5),
	pauseNow: ({ request }) => applyForce(request, 'block_now'),
	allowNow: ({ request }) => applyForce(request, 'allow_now')
};
