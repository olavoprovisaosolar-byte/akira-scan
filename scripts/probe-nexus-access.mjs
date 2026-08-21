#!/usr/bin/env node
/**
 * Probe rápido: a API NexusToons responde neste IP?
 * Exit 0 = OK | Exit 3 = Cloudflare/WAF bloqueou (não re-disparar workflow)
 */
import axios from "axios";
import { isCloudflareBlocked } from "../bots/nexustoons-akira/shared/cloudflare.js";

const BASE = process.env.NEXUSTOONS_BASE_URL || "https://nexustoons.com";

try {
    const res = await axios.get(`${BASE}/api/mangas?page=1&limit=1`, {
        timeout: 20000,
        headers: {
            Accept: "application/json",
            "User-Agent": process.env.NEXUSTOONS_USER_AGENT
                || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        },
        validateStatus: () => true
    });

    if (isCloudflareBlocked(res.status, res.data)) {
        console.log(JSON.stringify({ ok: false, blocked: true, status: res.status, reason: "cloudflare" }));
        process.exit(3);
    }
    if (res.status >= 400) {
        console.log(JSON.stringify({ ok: false, blocked: false, status: res.status }));
        process.exit(1);
    }
    console.log(JSON.stringify({ ok: true, status: res.status }));
    process.exit(0);
} catch (e) {
    console.log(JSON.stringify({ ok: false, error: e.message }));
    process.exit(1);
}
