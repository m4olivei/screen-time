/**
 * The one shape every notification transport speaks.
 *
 * A `Notice` is a single pre-cutoff warning: what to say, how long to keep it
 * on screen (transports that have no concept of duration ignore it), and which
 * threshold produced it so a transport can key an update off it.
 *
 * `Notifier.send` resolves `true` on success and `false` on any failure. It
 * never rejects: a warning that cannot be delivered is simply missed, by
 * design, and must not disturb the caller's loop.
 */
export interface Notice {
	/** Short heading, e.g. `Screen time`. */
	title: string;
	/** Body text, e.g. `Internet turns off in 15 minutes`. */
	message: string;
	/** How long the notice should stay on screen, in seconds. */
	durationSeconds: number;
	/** Minutes remaining before cutoff — the threshold that fired this notice. */
	thresholdMinutes: number;
}

export interface Notifier {
	/** Deliver a notice. Resolves `true` on a 2xx response, `false` otherwise. Never rejects. */
	send(notice: Notice): Promise<boolean>;
}

/** Request timeout shared by every transport, in milliseconds. */
export const NOTIFY_TIMEOUT_MS = 3000;
