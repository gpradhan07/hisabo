import "server-only";
import { headers } from "next/headers";

/**
 * A small in-memory limiter for the sign-in actions, on top of Firebase's own. It counts per server
 * instance, so on serverless it's a speed bump rather than a hard cap (project_arch.md §16).
 */

const hits: Map<string, number[]> = ((globalThis as typeof globalThis & { __hisaboHits?: Map<string, number[]> }).__hisaboHits ??= new Map());

/** True when `key` has made fewer than `max` attempts in the last `windowMs`; records this attempt. */
export function allow(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) hits.delete(hits.keys().next().value!);
  return true;
}

/** The caller's IP address, as reported by the hosting proxy. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
