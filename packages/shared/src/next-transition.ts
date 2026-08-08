import {
	computeDesiredState,
	type ComputeDesiredStateInput,
	type DesiredState
} from './desired-state.js';

/** How far ahead computeNextTransition looks before giving up (null). */
export const NEXT_TRANSITION_HORIZON_DAYS = 7;

const HORIZON_MS = NEXT_TRANSITION_HORIZON_DAYS * 24 * 60 * 60 * 1000;
const HALF_DAY_MS = 12 * 60 * 60 * 1000;

const WEEKDAY_TO_INDEX: Record<string, number> = {
	Sun: 0,
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6
};

/** A calendar date as seen on the wall clock of a specific IANA timezone. */
interface LocalDate {
	year: number;
	month: number; // 1–12
	day: number; // 1–31
	/** 0 = Sunday … 6 = Saturday (matches ScheduleWindow.dayOfWeek). */
	dayOfWeek: number;
}

function localDateFormatter(timeZone: string): Intl.DateTimeFormat {
	return new Intl.DateTimeFormat('en-US', {
		timeZone,
		weekday: 'short',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	});
}

interface LocalParts extends LocalDate {
	minuteOfDay: number;
}

function toLocalParts(instant: Date, formatter: Intl.DateTimeFormat): LocalParts {
	let weekday = '';
	let year = 0;
	let month = 0;
	let day = 0;
	let hour = 0;
	let minute = 0;
	for (const part of formatter.formatToParts(instant)) {
		if (part.type === 'weekday') weekday = part.value;
		else if (part.type === 'year') year = Number(part.value);
		else if (part.type === 'month') month = Number(part.value);
		else if (part.type === 'day') day = Number(part.value);
		else if (part.type === 'hour') hour = Number(part.value);
		else if (part.type === 'minute') minute = Number(part.value);
	}
	const dayOfWeek = WEEKDAY_TO_INDEX[weekday];
	if (dayOfWeek === undefined) {
		throw new Error(`Unexpected weekday "${weekday}" formatting ${instant.toISOString()}`);
	}
	return { year, month, day, dayOfWeek, minuteOfDay: hour * 60 + minute };
}

/**
 * Convert a wall-clock moment (local date + minutes since local midnight) in
 * `timeZone` to a UTC instant. Uses iterative offset correction via Intl, so
 * DST is handled without a timezone database: a guess is formatted back into
 * the zone and nudged by the difference until it round-trips. Nonexistent
 * wall-clock times (spring-forward gap) resolve to the shifted time; ambiguous
 * times (fall-back repeat) resolve to one of the two instants.
 */
function wallClockToInstant(
	date: LocalDate,
	minuteOfDay: number,
	formatter: Intl.DateTimeFormat
): Date {
	const desired = Date.UTC(date.year, date.month - 1, date.day, 0, minuteOfDay);
	let guess = desired;
	for (let attempt = 0; attempt < 3; attempt++) {
		const actualParts = toLocalParts(new Date(guess), formatter);
		const actual = Date.UTC(
			actualParts.year,
			actualParts.month - 1,
			actualParts.day,
			0,
			actualParts.minuteOfDay
		);
		if (actual === desired) break;
		guess += desired - actual;
	}
	return new Date(guess);
}

/**
 * Compute when the current ON/OFF state (as decided by computeDesiredState)
 * will next change, or null if no transition is known within the next
 * NEXT_TRANSITION_HORIZON_DAYS days.
 *
 * Method: the state is piecewise-constant and can only change at a window
 * boundary (a start/end minute on some local day) or when an override's
 * `effectiveUntil` passes. So we collect every such candidate instant inside
 * the horizon, sort them, and return the first one at which
 * computeDesiredState disagrees with the state right now. Because each
 * candidate is re-evaluated through computeDesiredState itself, this helper
 * can never contradict the single authority on schedule/override semantics.
 */
export function computeNextTransition(input: ComputeDesiredStateInput): Date | null {
	const { now, timeZone, windows, overrides } = input;
	const formatter = localDateFormatter(timeZone);
	const horizonEnd = now.getTime() + HORIZON_MS;

	const candidates = new Set<number>();

	// Window boundaries: enumerate each local calendar date in the horizon
	// (stepping by half days so DST shifts can never skip a date), and project
	// every window on that weekday to concrete instants.
	const seenDates = new Set<string>();
	for (let step = 0; step * HALF_DAY_MS <= HORIZON_MS + HALF_DAY_MS; step++) {
		const probe = new Date(now.getTime() + step * HALF_DAY_MS);
		const date = toLocalParts(probe, formatter);
		const key = `${date.year}-${date.month}-${date.day}`;
		if (seenDates.has(key)) continue;
		seenDates.add(key);
		for (const window of windows) {
			if (window.dayOfWeek !== date.dayOfWeek) continue;
			candidates.add(wallClockToInstant(date, window.startMinute, formatter).getTime());
			candidates.add(wallClockToInstant(date, window.endMinute, formatter).getTime());
		}
	}

	// Override expiry instants.
	for (const override of overrides) {
		candidates.add(override.effectiveUntil.getTime());
	}

	const ordered = [...candidates]
		.filter((t) => t > now.getTime() && t <= horizonEnd)
		.sort((a, b) => a - b);

	const currentState: DesiredState = computeDesiredState(input);
	for (const t of ordered) {
		if (computeDesiredState({ ...input, now: new Date(t) }) !== currentState) {
			return new Date(t);
		}
	}
	return null;
}

/**
 * The anchor for a create-or-extend "+N minutes" action when no active
 * `extend` override exists yet: the current cutoff.
 *
 * - State ON: the moment the internet would otherwise turn OFF (the next
 *   transition — window end or active override end). A new extend override's
 *   `effectiveUntil` should be anchor + N minutes so "+15" always means
 *   "15 minutes more than they were getting".
 * - State OFF (or ON with no known cutoff in the horizon): `now`, so "+15"
 *   grants 15 minutes starting immediately.
 */
export function computeExtendAnchor(input: ComputeDesiredStateInput): Date {
	if (computeDesiredState(input) === 'OFF') return input.now;
	return computeNextTransition(input) ?? input.now;
}
