import { getStore } from "@netlify/blobs";
import { handle } from "../lib/core.mjs";

export default async req => handle(req, getStore({ name: "heartbeat", consistency: "strong" }), process.env);
export const config = { path: ["/api/*", "/ping/*", "/login", "/logout"] };
