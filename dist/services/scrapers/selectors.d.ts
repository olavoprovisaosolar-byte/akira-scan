/** Seletores CSS precisos por provedor — isolar mudanças de layout. */
export declare const MANGALIVRE_SELECTORS: {
    readonly title: "h1, .post-title h1, .manga-title, meta[property='og:title']";
    readonly cover: "meta[property='og:image'], .summary_image img, .thumb img, .manga-poster img";
    readonly synopsis: ".description, .summary, .sinopse, #noidungm, .manga-excerpt";
    readonly chapterLinks: "a[href*='/capitulo'], a[href*='/chapter'], .wp-manga-chapter a, li.chapter a, .listing-chapters a";
    readonly pageImages: ".reading-content img, .page-chapter img, .chapter-content img, .images-chapter img, img[src*='.webp'], img[src*='.jpg']";
};
export declare const TOONLIVRE_SELECTORS: {
    readonly title: "h1, meta[property='og:title']";
    readonly cover: "meta[property='og:image'], img[src*='cover']";
    readonly synopsis: ".description, [class*='description']";
    readonly chapterLinks: "a[href*='/{slug}/']";
    readonly pageImages: "img[src*='.webp'], img[src*='.jpg'], img[src*='.png']";
};
export declare const TOONLIVRE_API: {
    readonly search: "/api/mangas/search";
    readonly mangaBySlug: (slug: string) => string;
    readonly chapter: (mangaId: string, chapterId: string) => string;
};
/** mangalivre.to — WordPress Madara / WP-Manga */
export declare const MANGALIVRETO_SELECTORS: {
    readonly title: "h1, .post-title h1, .manga-title, meta[property='og:title']";
    readonly cover: "meta[property='og:image'], .summary_image img, .thumb img, .manga-poster img";
    readonly synopsis: "meta[name='description'], .description, .summary, .sinopse, .manga-excerpt, .manga-summary, #noidungm";
    readonly chapterLinks: "a[href*='/capitulo-'], a[href*='/chapter-'], .wp-manga-chapter a, li.chapter a, .listing-chapters a";
    readonly pageImages: ".reading-content img, .page-chapter img, .chapter-content img, .images-chapter img";
    readonly listingLinks: "a[href*='/manga/']";
    readonly nextPage: ".pagination a.next, a.next.page-numbers, .nav-next a";
};
/** mangalivre.blog — Slimeread / WP-Manga */
export declare const MANGALIVREBLOG_SELECTORS: {
    readonly title: "h1, .post-title h1, meta[property='og:title']";
    readonly cover: "meta[property='og:image'], .summary_image img, .thumb img";
    readonly synopsis: "meta[name='description'], .description, .manga-excerpt, .manga-summary";
    readonly chapterLinks: "a[href*='/capitulo-'], a[href*='/chapter-'], .wp-manga-chapter a, li.chapter a, .listing-chapters a";
    readonly pageImages: ".reading-content img, .page-chapter img, img[src*='.webp'], img[src*='.jpg']";
    readonly nextPage: ".pagination a.next, a.next.page-numbers, .nav-next a, #load_more_chapter";
};
/** bladetoons.com — Next.js */
export declare const BLADETOONS_SELECTORS: {
    readonly title: "h1, meta[property='og:title']";
    readonly cover: "meta[property='og:image'], img[src*='cover']";
    readonly synopsis: "meta[name='description']";
    readonly chapterLinks: "a[href*='capitulo'], a[href*='chapter'], a[href*='/cap-'], [data-chapter] a";
    readonly pageImages: "img[src*='.webp'], img[src*='.jpg'], img[src*='.png'], main img";
    readonly nextPage: "a[rel='next'], button:contains('Carregar'), .load-more";
};
