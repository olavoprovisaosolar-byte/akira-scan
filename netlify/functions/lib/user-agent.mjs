/** Rotação de User-Agent para resiliência contra bloqueios. */
const AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0"
];

let idx = 0;

export function nextUserAgent() {
    const ua = AGENTS[idx % AGENTS.length];
    idx += 1;
    return ua;
}

export function browserHeaders(origin = "") {
    return {
        "User-Agent": nextUserAgent(),
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        Accept: "text/html,application/json,*/*;q=0.8",
        ...(origin ? { Origin: origin, Referer: `${origin}/` } : {})
    };
}
