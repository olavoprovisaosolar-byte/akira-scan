declare const client: import("axios").AxiosInstance;
export declare function fetchText(url: string, referer?: string): Promise<string>;
export declare function fetchJson<T>(url: string, referer?: string): Promise<T>;
export { client as axiosClient };
