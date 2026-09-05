import type { Agent, PtySession } from '../types';

// Display identity is server-owned. Every view follows the same
// PTY label -> canonical name rule; there is no client-local fallback.
export function daemonDisplayName(agent: Agent): string {
	return agent.name;
}

export function sessionDisplayName(session: PtySession): string {
	return session.label?.trim() || session.name;
}
