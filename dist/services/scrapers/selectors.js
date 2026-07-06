/** Seletores CSS precisos por provedor — isolar mudanças de layout. */
export const MANGALIVRE_SELECTORS = {
    title: "h1, .post-title h1, .manga-title, meta[property='og:title']",
    cover: "meta[property='og:image'], .summary_image img, .thumb img, .manga-poster img",
    synopsis: ".description, .summary, .sinopse, #noidungm, .manga-excerpt",
    chapterLinks: "a[href*='/capitulo'], a[href*='/chapter'], .wp-manga-chapter a, li.chapter a, .listing-chapters a",
    pageImages: ".reading-content img, .page-chapter img, .chapter-content img, .images-chapter img, img[src*='.webp'], img[src*='.jpg']"
};
export const TOONLIVRE_SELECTORS = {
    title: "h1, meta[property='og:title']",
    cover: "meta[property='og:image'], img[src*='cover']",
    synopsis: ".description, [class*='description']",
    chapterLinks: `a[href*='/${"{slug}"}/']`,
    pageImages: "img[src*='.webp'], img[src*='.jpg'], img[src*='.png']"
};
export const TOONLIVRE_API = {
    search: "/api/mangas/search",
    mangaBySlug: (slug) => `/api/manga-by-slug/${encodeURIComponent(slug)}`,
    chapter: (mangaId, chapterId) => `/api/mangas/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(chapterId)}`
};
/** mangalivre.to — WordPress Madara / WP-Manga */
export const MANGALIVRETO_SELECTORS = {
    title: "h1, .post-title h1, .manga-title, meta[property='og:title']",
    cover: "meta[property='og:image'], .summary_image img, .thumb img, .manga-poster img",
    synopsis: "meta[name='description'], .description, .summary, .sinopse, .manga-excerpt, .manga-summary, #noidungm",
    chapterLinks: "a[href*='/capitulo-'], a[href*='/chapter-'], .wp-manga-chapter a, li.chapter a, .listing-chapters a",
    pageImages: ".reading-content img, .page-chapter img, .chapter-content img, .images-chapter img",
    listingLinks: "a[href*='/manga/']",
    nextPage: ".pagination a.next, a.next.page-numbers, .nav-next a"
};
/** mangalivre.blog — Slimeread / WP-Manga */
export const MANGALIVREBLOG_SELECTORS = {
    title: "h1, .post-title h1, meta[property='og:title']",
    cover: "meta[property='og:image'], .summary_image img, .thumb img",
    synopsis: "meta[name='description'], .description, .manga-excerpt, .manga-summary",
    chapterLinks: "a[href*='/capitulo-'], a[href*='/chapter-'], .wp-manga-chapter a, li.chapter a, .listing-chapters a",
    pageImages: ".reading-content img, .page-chapter img, img[src*='.webp'], img[src*='.jpg']",
    nextPage: ".pagination a.next, a.next.page-numbers, .nav-next a, #load_more_chapter"
};
/** bladetoons.com — Next.js */
export const BLADETOONS_SELECTORS = {
    title: "h1, meta[property='og:title']",
    cover: "meta[property='og:image'], img[src*='cover']",
    synopsis: "meta[name='description']",
    chapterLinks: "a[href*='capitulo'], a[href*='chapter'], a[href*='/cap-'], [data-chapter] a",
    pageImages: "img[src*='.webp'], img[src*='.jpg'], img[src*='.png'], main img",
    nextPage: "a[rel='next'], button:contains('Carregar'), .load-more"
};
