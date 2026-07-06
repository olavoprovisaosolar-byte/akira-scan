/**
 * Cliente HTTP do proxy — axios com rotação de User-Agent.
 */
import axios, { type AxiosRequestConfig } from "axios";
import { browserHeaders } from "./user-agent.js";

const client = axios.create({
    timeout: 25_000,
    maxRedirects: 5,
    validateStatus: (s) => s < 500
});

export async function fetchText(url: string, referer?: string): Promise<string> {
    const config: AxiosRequestConfig = {
        headers: browserHeaders(referer || url),
        responseType: "text"
    };
    const res = await client.get<string>(url, config);
    if (res.status >= 400) {
        throw new Error(`HTTP ${res.status} — ${url}`);
    }
    return res.data;
}

export async function fetchJson<T>(url: string, referer?: string): Promise<T> {
    const config: AxiosRequestConfig = {
        headers: browserHeaders(referer),
        responseType: "json"
    };
    const res = await client.get<T>(url, config);
    if (res.status >= 400) {
        throw new Error(`HTTP ${res.status} — ${url}`);
    }
    return res.data;
}

export { client as axiosClient };
