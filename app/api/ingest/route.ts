import type { NextRequest } from "next/server";
import { clientConfig, hostedConfig } from "@/lib/server/config";
import { hostedServices } from "@/lib/server/hosted";
import { handleIngest, type IngestReply } from "@/lib/server/ingest";
import { signalChange } from "@/lib/server/live";
import { markDriveLost, storeForUser } from "@/lib/server/store";

/**
 * The iOS Shortcut's address (hosted mode). It authenticates with a phone key, not a session:
 * GET returns the category and payment lists, POST saves one entry and answers in plain text.
 */

function reply(r: IngestReply) {
  const headers = { "Cache-Control": "no-store" };
  return "json" in r
    ? Response.json(r.json, { status: r.status, headers })
    : new Response(r.text, { status: r.status, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
}

async function handle(request: NextRequest, method: "GET" | "POST") {
  const config = hostedConfig();
  if (!config) return new Response("Not found", { status: 404 });
  const { phoneKeys, signals } = hostedServices(config);
  return reply(
    await handleIngest(
      {
        phoneKeys,
        storeForUser,
        markDriveLost: (uid) => markDriveLost({ kind: "hosted", uid }),
        currency: clientConfig().currency,
        notify: (uid) => signalChange(signals, uid),
      },
      {
        method,
        authorization: request.headers.get("authorization"),
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
        body: method === "POST" ? await request.text() : undefined,
      },
    ),
  );
}

export const GET = (request: NextRequest) => handle(request, "GET");
export const POST = (request: NextRequest) => handle(request, "POST");
