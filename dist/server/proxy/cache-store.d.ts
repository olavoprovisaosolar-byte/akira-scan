declare const TTL_MS: number;
export interface CacheHit<T> {
    payload: T;
    cached: true;
    source: string;
    from: "firestore" | "local";
}
export declare function cacheGet<T>(key: string): Promise<CacheHit<T> | null>;
export declare function cacheSet<T>(key: string, payload: T, source?: string): Promise<void>;
export declare function cacheKey(source: string, type: string, id: string, extra?: string): string;
export { TTL_MS };
