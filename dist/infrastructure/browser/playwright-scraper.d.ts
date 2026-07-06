export declare function fetchHtmlWithBrowser(url: string, waitMs?: number): Promise<string>;
/** Scroll infinito — dispara lazy-load de listas longas de capítulos. */
export declare function fetchHtmlWithScroll(url: string, opts?: {
    waitMs?: number;
    scrollSteps?: number;
}): Promise<string>;
export declare function usePlaywright(): boolean;
export declare function closeBrowser(): Promise<void>;
