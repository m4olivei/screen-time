/**
 * Pre-cutoff warning timing — the single authority for *which* warning is due,
 * mirroring how `desired-state.ts` is the single authority for ON/OFF.
 *
 * This module is pure: it never reads schedule windows or overrides, never
 * computes the cutoff itself, and never reads the clock. Both `now` and
 * `cutoff` are inputs; the caller obtains the cutoff from
 * `computeNextTransition`, so warning timing can never contradict the
 * desired-state rules.
 */

/** Minutes-before-cutoff at which a warning is shown, longest first. */
export const WARNING_THRESHOLDS_MINUTES = [30, 15, 10, 5, 2, 1];

/**
 * How late a threshold may fire. A threshold that came due longer ago than
 * this is stale: it is marked handled but never sent, so a worker that
 * restarts (or a tick that ran long) cannot emit a burst of backdated
 * warnings.
 */
export const WARNING_GRACE_MS = 60_000;

const MINUTE_MS = 60 * 1000;

/** The rendered warning for one threshold. */
export interface WarningDescription {
	title: string;
	message: string;
	/** How long the notification should stay on screen. */
	durationSeconds: number;
}

export interface ComputeDueWarningsInput {
	/** The instant being evaluated (the current tick). */
	now: Date;
	/** The instant the internet turns off, from `computeNextTransition`. */
	cutoff: Date;
	/** Thresholds already dealt with for this cutoff; never returned again. */
	handledThresholds: readonly number[];
	/** Staleness window; defaults to `WARNING_GRACE_MS`. */
	graceMs?: number;
}

export interface DueWarnings {
	/** The one threshold to notify about on this tick, or null. */
	send: number | null;
	/**
	 * Every threshold the caller must record as dealt with — the complete due
	 * set, including `send`. Ordered longest-first, as declared in
	 * `WARNING_THRESHOLDS_MINUTES`.
	 */
	handle: number[];
}

/** Title, text, and display duration for a threshold. */
export function describeWarning(thresholdMinutes: number): WarningDescription {
	const unit = thresholdMinutes === 1 ? 'minute' : 'minutes';
	return {
		title: 'Screen time',
		message: `Internet turns off in ${thresholdMinutes} ${unit}`,
		durationSeconds: thresholdMinutes === 1 ? 60 : 15
	};
}

/**
 * Decide which warning to send on this tick.
 *
 * A threshold `T` comes due at `cutoff - T minutes`. Of the thresholds that
 * are due (`dueAt <= now`) and not yet handled, the *fresh* ones — due no
 * longer than `graceMs` ago — are eligible; the smallest of those is sent, so
 * at most one notification fires per tick and it is always the most urgent
 * one. Everything due is returned in `handle`, sent or not, so the caller
 * records the whole backlog and never revisits it.
 */
export function computeDueWarnings(input: ComputeDueWarningsInput): DueWarnings {
	const { now, cutoff, handledThresholds } = input;
	const graceMs = input.graceMs ?? WARNING_GRACE_MS;
	const nowMs = now.getTime();
	const cutoffMs = cutoff.getTime();

	const due = WARNING_THRESHOLDS_MINUTES.filter((threshold) => {
		if (handledThresholds.includes(threshold)) return false;
		return cutoffMs - threshold * MINUTE_MS <= nowMs;
	});

	const fresh = due.filter((threshold) => nowMs - (cutoffMs - threshold * MINUTE_MS) <= graceMs);
	const send = fresh.length > 0 ? Math.min(...fresh) : null;

	return { send, handle: due };
}
