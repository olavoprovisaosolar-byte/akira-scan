/**
 * Cliente HTTP do proxy — axios com rotação de User-Agent.
 */
import axios from "axios";
import { browserHeaders } from "./user-agent.js";
const client = axios.create({
    timeout: 25_000,
    maxRedirects: 5,
    validateStatus: (s) => s < 500
});
export async function fetchText(url, referer) {
    const config = {
        headers: browserHeaders(referer || url),
        responseType: "text"
    };
    const res = await client.get(url, config);
    if (res.status >= 400) {
        throw new Error(`HTTP ${res.status} — ${url}`);
    }
    return res.data;
}
export async function fetchJson(url, referer) {
    const config = {
        headers: browserHeaders(referer),
        responseType: "json"
    };
    const res = await client.get(url, config);
    if (res.status >= 400) {
        throw new Error(`HTTP ${res.status} — ${url}`);
    }
    return res.data;
}
export { client as axiosClient };
