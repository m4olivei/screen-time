import type { Override } from './db/entities/Override.js';
import type { ScheduleWindow } from './db/entities/ScheduleWindow.js';

export interface ComputeDesiredStateInput {
	now: Date;
	timeZone: string;
	windows: ScheduleWindow[];
	overrides: Override[];
}

export type DesiredState = 'ON' | 'OFF';

/** `now` expressed as wall-clock time in a specific IANA timezone. */
interface WallClock {
	/** Day of week: 0 = Sunday … 6 = Saturday (matches ScheduleWindow.dayOfWeek). */
	dayOfWeek: number;
	/** Minutes since local midnight, 0–1439. */
	minuteOfDay: number;
}

const WEEKDAY_TO_INDEX: Record<string, number> = {
	Sun: 0,
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6
};

/**
 * Convert an instant to (dayOfWeek, minuteOfDay) in the given IANA timezone
 * using Intl — never the process default zone. DST is handled by Intl: during
 * spring-forward the skipped hour simply never appears, and during fall-back
 * the repeated wall-clock hour maps from two different instants.
 */
function toWallClock(now: Date, timeZone: string): WallClock {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		weekday: 'short',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(now);

	let weekday = '';
	let hour = 0;
	let minute = 0;
	for (const part of parts) {
		if (part.type === 'weekday') weekday = part.value;
		else if (part.type === 'hour') hour = Number(part.value);
		else if (part.type === 'minute') minute = Number(part.value);
	}

	const dayOfWeek = WEEKDAY_TO_INDEX[weekday];
	if (dayOfWeek === undefined) {
		throw new Error(`Unexpected weekday "${weekday}" formatting ${now.toISOString()}`);
	}
	return { dayOfWeek, minuteOfDay: hour * 60 + minute };
}

/** A window covers [startMinute, endMinute): start inclusive, end exclusive. */
function isInsideWindow(window: ScheduleWindow, clock: WallClock): boolean {
	return (
		window.dayOfWeek === clock.dayOfWeek &&
		clock.minuteOfDay >= window.startMinute &&
		clock.minuteOfDay < window.endMinute
	);
}

/**
 * Pick the override that decides the state, or null if none applies.
 *
 * - An override is ACTIVE while `effectiveUntil > now` (strictly in the
 *   future). An override whose `effectiveUntil` is at or before `now` is
 *   expired and completely ignored.
 * - PRECEDENCE: when several overrides are active at once, the most recently
 *   CREATED one wins (latest `createdAt`; ties broken by highest `id`).
 *   Rationale: each override is a deliberate parental action, so the newest
 *   instruction supersedes older ones — pressing "block now" after an earlier
 *   "extend" blocks immediately.
 */
function pickWinningOverride(overrides: Override[], now: Date): Override | null {
	let winner: Override | null = null;
	for (const override of overrides) {
		if (override.effectiveUntil.getTime() <= now.getTime()) continue; // expired
		if (
			winner === null ||
			override.createdAt.getTime() > winner.createdAt.getTime() ||
			(override.createdAt.getTime() === winner.createdAt.getTime() && override.id > winner.id)
		) {
			winner = override;
		}
	}
	return winner;
}

/**
 * Compute whether a profile's internet should currently be ON or OFF.
 *
 * Pure function — no database, no network, no process-default timezone. This
 * is the SINGLE AUTHORITY for schedule/override semantics; the worker and the
 * web UI must call it rather than re-implementing any rule.
 *
 * Schedule semantics:
 * - Windows are recurring weekly ALLOWED windows keyed by dayOfWeek (0 =
 *   Sunday … 6 = Saturday), covering [startMinute, endMinute) — start
 *   inclusive, end exclusive — in the household's IANA `timeZone`.
 * - Inside any window ⇒ ON; outside all windows ⇒ OFF.
 * - A window that spans midnight is stored as two rows: day A
 *   [startMinute, 1440) and day B [0, endMinute). Evaluation is purely
 *   per-day, so the pair behaves as one continuous window across midnight.
 *
 * Override semantics (only the winning ACTIVE override applies — see
 * pickWinningOverride for active/precedence rules):
 * - `block_now`: forces OFF until `effectiveUntil`, even inside a window.
 * - `allow_now`: forces ON until `effectiveUntil`, even outside all windows.
 * - `extend`: pushes the cutoff of the current (or most recently ended)
 *   window to `effectiveUntil`, i.e. the state is ON while the override is
 *   active. When no window is relevant today, `extend` deliberately degrades
 *   to `allow_now` (ON until `effectiveUntil`) — the simplest defensible
 *   semantics for "more time" when there is nothing to extend. Net effect:
 *   while active, `extend` always yields ON; once it expires the schedule
 *   takes over again.
 */
export function computeDesiredState(input: ComputeDesiredStateInput): DesiredState {
	const winner = pickWinningOverride(input.overrides, input.now);
	if (winner !== null) {
		return winner.type === 'block_now' ? 'OFF' : 'ON';
	}

	const clock = toWallClock(input.now, input.timeZone);
	const insideWindow = input.windows.some((window) => isInsideWindow(window, clock));
	return insideWindow ? 'ON' : 'OFF';
}
