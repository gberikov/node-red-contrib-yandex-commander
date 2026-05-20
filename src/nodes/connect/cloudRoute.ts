import type { MessageType } from '@/lib/types';

export type CloudRoute = 'local' | 'cloud' | 'offline';

/**
 * Pure decision table for routing TTS dispatch.
 *
 * Why: keeps the branchy logic out of connect.ts and trivially unit-testable.
 *
 * - Non-TTS message types always go local (cloud only implements TTS).
 * - msg.cloud === true forces cloud (per-message override).
 * - If the local WebSocket is open, prefer local.
 * - msg.cloud === false forbids cloud — offline if local also unavailable.
 * - Otherwise: cloud iff the OUT-node fallback checkbox is on.
 */
export function decideCloudRoute(
  messageType: MessageType,
  localOpen: boolean,
  msgCloud: boolean | undefined,
  cloudFallback: boolean | undefined,
): CloudRoute {
  if (messageType !== 'tts') return 'local';
  if (msgCloud === true) return 'cloud';
  if (localOpen) return 'local';
  if (msgCloud === false) return 'offline';
  if (cloudFallback === true) return 'cloud';
  return 'offline';
}
