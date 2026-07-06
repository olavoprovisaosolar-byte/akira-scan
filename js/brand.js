/** Identidade visual AkiraScan */
export const BRAND = {
    name: "AkiraScan",
    displayName: "Akira Scan",
    tagline: "Leia. Descubra. Viva histórias.",
    logo: "img/akirascan-logo.png",
    logoAlt: "Akira Scan — Leia, descubra, viva histórias",
    /** Usar wordmark em texto (header, footer, hero). Favicon continua PNG. */
    useTextLogo: true
};

/** Wordmark tipográfico — "Akira" roxo + "Scan" branco */
export function renderLogoText(variant = "header") {
    const cls = variant === "hero"
        ? "akira-logo-text akira-logo-text-hero"
        : variant === "footer"
            ? "akira-logo-text akira-logo-text-footer"
            : "akira-logo-text";
    return `<span class="${cls}" aria-hidden="true"><span class="akira-text">Akira</span><span class="scan-text"> Scan</span></span>`;
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
    <meta property="og:image" content="${BRAND.logo}">
    <meta property="og:site_name" content="${BRAND.displayName}">`;
}
