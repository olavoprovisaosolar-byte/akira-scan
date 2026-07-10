/**
 * Leitor vertical — <div class="meu-leitor-manga-css"><img class="pagina-manga" /></div>
 */
const blobUrlCache = new Map();

function isCloudPageUrl(url) {
    return /\/api\/cloud\/page(\?|$)/i.test(String(url || ""));
}

async function resolveImageSrc(url) {
    const src = String(url || "");
    if (!src) return "";
    if (!isCloudPageUrl(src)) return src;
    if (blobUrlCache.has(src)) return blobUrlCache.get(src);

    const res = await fetch(src, { cache: "no-store", mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const upstream = String(res.headers.get("content-type") || "").toLowerCase();
    const type = upstream.startsWith("image/")
        ? upstream
        : (buf.byteLength >= 12 && new TextDecoder().decode(new Uint8Array(buf, 8, 4)) === "WEBP"
            ? "image/webp"
            : "image/jpeg");
    const objectUrl = URL.createObjectURL(new Blob([buf], { type }));
    blobUrlCache.set(src, objectUrl);
    return objectUrl;
}

export class LeitorVertical {
    constructor(container, opcoes = {}) {
        this.container = container;
        this.paginas = opcoes.paginas || opcoes.urls?.map((u) => ({ url: u, original: u })) || [];
        this.aoMudarPagina = opcoes.aoMudarPagina;
        this.barraProgresso = opcoes.barraProgresso;
        this._observer = null;
        this._paginaAtual = 0;
        this._alive = true;
    }

    render() {
        this.destruir();
        this._alive = true;
        this.container.innerHTML = "";

        if (!this.paginas.length) {
            this.container.innerHTML = `
                <div class="leitor-estado">
                    <h2>Capítulo vazio</h2>
                    <p>Nenhuma página disponível.</p>
                </div>`;
            return;
        }

        const leitor = document.createElement("div");
        leitor.className = "meu-leitor-manga-css";

        this.paginas.forEach((pag, index) => {
            const wrap = document.createElement("div");
            wrap.className = "pagina-wrap";

            const img = document.createElement("img");
            img.className = "pagina-manga";
            img.alt = `Página ${index + 1}`;
            img.decoding = "async";
            img.loading = index < 2 ? "eager" : "lazy";
            img.dataset.index = String(index);
            img.dataset.src = pag.url;
            img.referrerPolicy = "no-referrer";

            const retryBtn = document.createElement("button");
            retryBtn.type = "button";
            retryBtn.className = "pagina-retry escondido";
            retryBtn.textContent = "Tocar para tentar de novo";
            retryBtn.addEventListener("click", () => {
                img.classList.remove("erro");
                retryBtn.classList.add("escondido");
                delete img.dataset.retry;
                delete img.dataset.ready;
                delete img.dataset.loading;
                blobUrlCache.delete(pag.url);
                this._aplicarSrc(img);
            });

            img.addEventListener("load", () => {
                img.classList.add("carregada");
                img.classList.remove("erro");
                retryBtn.classList.add("escondido");
            });
            img.addEventListener("error", () => {
                if (img.dataset.retry === "1") {
                    img.classList.add("erro");
                    retryBtn.classList.remove("escondido");
                    return;
                }
                img.dataset.retry = "1";
                const src = img.dataset.src || "";
                if (/\.webp(\?|$)/i.test(src) && !isCloudPageUrl(src)) {
                    img.src = src.replace(/\.webp(\?|$)/i, ".jpg$1");
                    return;
                }
                if (/\.jpg(\?|$)/i.test(src) && !isCloudPageUrl(src)) {
                    img.src = src.replace(/\.jpg(\?|$)/i, ".webp$1");
                    return;
                }
                img.classList.add("erro");
                retryBtn.classList.remove("escondido");
            });

            wrap.appendChild(img);
            wrap.appendChild(retryBtn);
            leitor.appendChild(wrap);
        });

        this.container.appendChild(leitor);
        this._iniciarObserver(leitor);
        this._carregarVisiveis(leitor);
    }

    async _aplicarSrc(img) {
        if (!this._alive || !img || img.dataset.loading === "1" || img.dataset.ready === "1") return;
        const raw = img.dataset.src || "";
        if (!raw) return;
        img.dataset.loading = "1";
        try {
            const src = await resolveImageSrc(raw);
            if (!this._alive) return;
            img.src = src;
            img.dataset.ready = "1";
        } catch {
            if (!this._alive) return;
            img.src = raw;
            img.dataset.ready = "1";
        } finally {
            img.dataset.loading = "0";
        }
    }

    _iniciarObserver(leitor) {
        const margem = `${Math.round(window.innerHeight * 0.6)}px`;

        this._observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const img = entry.target;
                    if (!entry.isIntersecting) return;

                    this._aplicarSrc(img);

                    const index = Number(img.dataset.index);
                    if (!Number.isNaN(index) && index !== this._paginaAtual) {
                        this._paginaAtual = index;
                        this._atualizarProgresso();
                        this.aoMudarPagina?.(index, this.paginas.length);
                    }
                });
            },
            { rootMargin: `${margem} 0px ${margem} 0px`, threshold: 0.01 }
        );

        leitor.querySelectorAll(".pagina-manga").forEach((img) => {
            this._observer.observe(img);
        });
    }

    _carregarVisiveis(leitor) {
        leitor.querySelectorAll(".pagina-manga").forEach((img) => {
            const rect = img.getBoundingClientRect();
            if (rect.top < window.innerHeight + 200 && rect.bottom > -200) {
                this._aplicarSrc(img);
            }
        });
    }

    _atualizarProgresso() {
        if (!this.barraProgresso || !this.paginas.length) return;
        const pct = ((this._paginaAtual + 1) / this.paginas.length) * 100;
        this.barraProgresso.style.width = `${pct}%`;
    }

    destruir() {
        this._alive = false;
        this._observer?.disconnect();
        this._observer = null;
    }
}
