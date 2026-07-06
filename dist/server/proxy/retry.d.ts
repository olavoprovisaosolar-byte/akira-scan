export declare function withRetry<T>(fn: () => Promise<T>, opts?: {
    maxAttempts?: number;
    baseMs?: number;
    label?: string;
}): Promise<T>;
