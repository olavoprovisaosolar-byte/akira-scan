/** Identidade visual AkiraScan */
export const BRAND = {
    name: "AkiraScan",
    displayName: "AkiraScan",
    tagline: "Leia. Descubra. Viva histórias.",
    logo: "img/akirascan-logo.png",
    logoAlt: "AkiraScan — Leia, descubra, viva histórias",
    /** Logo PNG oficial (wordmark no header/footer/hero). */
    useTextLogo: false
};

/** Wordmark tipográfico — fallback se a imagem não carregar */
export function renderLogoText(variant = "header") {
    const cls = variant === "hero"
        ? "akira-logo-text akira-logo-text-hero"
        : variant === "footer"
            ? "akira-logo-text akira-logo-text-footer"
            : "akira-logo-text";
    return `<span class="${cls}" aria-hidden="true"><span class="akira-text">Akira</span><span class="scan-text">Scan</span></span>`;
}

export function renderLogo(variant = "header") {
    if (BRAND.useTextLogo) return renderLogoText(variant);
    const sizes = { header: 'width="140" height="40"', footer: 'width="200" height="57"', hero: 'width="480" height="480" fetchpriority="high"' };
    const extra = sizes[variant] || sizes.header;
    const cls = variant === "hero" ? "hero-brand-logo" : variant === "footer" ? "footer-logo" : "akira-logo-img";
    return `<img class="${cls}" src="${BRAND.logo}" alt="${BRAND.logoAlt}" ${extra} decoding="async">`;
}

export function headMeta() {
    return `
    <link rel="icon" type="image/png" href="${BRAND.logo}">
    <link rel="apple-touch-icon" href="${BRAND.logo}">
    <meta name="application-name" content="${BRAND.displayName}">
    <meta property="og:site_name" content="${BRAND.displayName}">
    <meta property="og:image" content="${BRAND.logo}">`;
}

/** Injeta meta de marca nas páginas (nome AkiraScan no browser/PWA). */
export function injectBrandMeta() {
    if (typeof document === "undefined") return;
    const head = document.head;
    if (!head || head.dataset.akiraBrand) return;
    head.dataset.akiraBrand = "1";

    if (!document.querySelector('meta[name="application-name"]')) {
        const app = document.createElement("meta");
        app.name = "application-name";
        app.content = BRAND.displayName;
        head.appendChild(app);
    }
    if (!document.querySelector('meta[property="og:site_name"]')) {
        const og = document.createElement("meta");
        og.setAttribute("property", "og:site_name");
        og.content = BRAND.displayName;
        head.appendChild(og);
    }
    if (!document.querySelector('link[rel="manifest"]')) {
        const manifest = document.createElement("link");
        manifest.rel = "manifest";
        manifest.href = "manifest.json";
        head.appendChild(manifest);
    }
}
