export declare const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
export declare function browserHeaders(referer?: string, extra?: Record<string, string>): Record<string, string>;
export declare function fetchText(url: string, opts?: {
    referer?: string;
    headers?: Record<string, string>;
    allowRedirects?: boolean;
    maxHops?: number;
}): Promise<string>;
export declare function fetchJson<T>(url: string, opts?: {
    referer?: string;
    headers?: Record<string, string>;
}): Promise<T>;
