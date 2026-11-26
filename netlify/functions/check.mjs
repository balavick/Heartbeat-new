import { getStore } from "@netlify/blobs";
import { check } from "../lib/core.mjs";

export default async () => { await check(getStore({ name: "heartbeat", consistency: "strong" }), process.env); };
export const config = { schedule: "*/5 * * * *" };
