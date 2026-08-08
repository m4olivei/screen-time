import { fail } from '@sveltejs/kit';
import {
	createScheduleWindow,
	deleteScheduleWindow,
	getAllProfiles,
	getScheduleWindows,
	updateScheduleWindow
} from '@screen-time/shared';
import { getDataSource } from '$lib/server/db.js';
import { TIMEZONE } from '$lib/server/env.js';
import type { Actions, PageServerLoad } from './$types.js';

const DAY_NAMES = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
] as const;

const MAX_MINUTE = 24 * 60 - 1; // 1439 — times are minutes from local midnight, 0–1439

/** 990 → "16:30" for `<input type="time">` values. */
function minutesToHhmm(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "16:30" → 990, or null when not a valid HH:MM within 00:00–23:59. */
function hhmmToMinutes(value: FormDataEntryValue | null): number | null {
	if (typeof value !== 'string') return null;
	const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	if (!match) return null;
	const minutes = Number(match[1]) * 60 + Number(match[2]);
	return Number(match[2]) < 60 && minutes >= 0 && minutes <= MAX_MINUTE ? minutes : null;
}

function parseId(value: FormDataEntryValue | null): number | null {
	const id = Number(value);
	return Number.isInteger(id) && id > 0 ? id : null;
}

export const load: PageServerLoad = async ({ url }) => {
	const dataSource = await getDataSource();
	const profiles = await getAllProfiles(dataSource);

	const requestedId = Number(url.searchParams.get('profile'));
	const profile = profiles.find((p) => p.id === requestedId) ?? profiles[0] ?? null;

	const windows = profile ? await getScheduleWindows(dataSource, profile.id) : [];
	const days = DAY_NAMES.map((name, dayOfWeek) => ({
		dayOfWeek,
		name,
		windows: windows
			.filter((w) => w.dayOfWeek === dayOfWeek)
			.map((w) => ({
				id: w.id,
				start: minutesToHhmm(w.startMinute),
				end: minutesToHhmm(w.endMinute)
			}))
	}));

	return {
		profile: profile ? { id: profile.id, name: profile.name } : null,
		profiles: profiles.map((p) => ({ id: p.id, name: p.name })),
		days,
		timeZone: TIMEZONE
	};
};

/**
 * Parse and validate the start/end HH:MM fields shared by add and update.
 * Returns minutes on success or a human-readable problem string.
 */
function parseTimes(
	form: FormData
): { startMinute: number; endMinute: number } | { problem: string } {
	const startMinute = hhmmToMinutes(form.get('start'));
	const endMinute = hhmmToMinutes(form.get('end'));
	if (startMinute === null || endMinute === null) {
		return { problem: 'Times must be valid HH:MM values between 00:00 and 23:59.' };
	}
	if (endMinute <= startMinute) {
		return { problem: 'End time must be after start time.' };
	}
	return { startMinute, endMinute };
}

export const actions: Actions = {
	add: async ({ request }) => {
		const form = await request.formData();
		const profileId = parseId(form.get('profileId'));
		const dayOfWeek = Number(form.get('dayOfWeek'));
		if (profileId === null || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
			return fail(400, { message: 'Invalid profile or day.' });
		}

		const times = parseTimes(form);
		if ('problem' in times) {
			return fail(400, { message: `${DAY_NAMES[dayOfWeek]}: ${times.problem}`, dayOfWeek });
		}

		const dataSource = await getDataSource();
		await createScheduleWindow(dataSource, { profileId, dayOfWeek, ...times });
		return { success: true };
	},

	update: async ({ request }) => {
		const form = await request.formData();
		const windowId = parseId(form.get('windowId'));
		if (windowId === null) return fail(400, { message: 'Missing window.' });

		const times = parseTimes(form);
		if ('problem' in times) {
			return fail(400, { message: times.problem, windowId });
		}

		const dataSource = await getDataSource();
		const updated = await updateScheduleWindow(dataSource, windowId, times);
		if (!updated) return fail(404, { message: 'That window no longer exists.' });
		return { success: true };
	},

	delete: async ({ request }) => {
		const form = await request.formData();
		const windowId = parseId(form.get('windowId'));
		if (windowId === null) return fail(400, { message: 'Missing window.' });

		const dataSource = await getDataSource();
		await deleteScheduleWindow(dataSource, windowId);
		return { success: true };
	}
};
