/**
 * Leitor vertical — <div class="meu-leitor-manga-css"><img class="pagina-manga" /></div>
 */
export class LeitorVertical {
    constructor(container, opcoes = {}) {
        this.container = container;
        this.paginas = opcoes.paginas || opcoes.urls?.map((u) => ({ url: u, original: u })) || [];
        this.aoMudarPagina = opcoes.aoMudarPagina;
        this.barraProgresso = opcoes.barraProgresso;
        this._observer = null;
        this._paginaAtual = 0;
    }

    render() {
        this.destruir();
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
            const img = document.createElement("img");
            img.className = "pagina-manga";
            img.alt = `Página ${index + 1}`;
            img.decoding = "async";
            img.loading = index < 2 ? "eager" : "lazy";
            img.dataset.index = String(index);
            img.dataset.src = pag.url;

            img.referrerPolicy = "no-referrer";
            img.addEventListener("load", () => img.classList.add("carregada"));
    img.addEventListener("error", () => {
        img.classList.add("erro");
        const src = img.dataset.src || img.src || "";
        if (/\.webp(\?|$)/i.test(src)) {
            img.src = src.replace(/\.webp(\?|$)/i, ".jpg$1");
            return;
        }
        if (/\.jpg(\?|$)/i.test(src)) {
            img.src = src.replace(/\.jpg(\?|$)/i, ".webp$1");
        }
    });

            leitor.appendChild(img);
        });

        this.container.appendChild(leitor);
        this._iniciarObserver(leitor);
        this._carregarVisiveis(leitor);
    }

    _iniciarObserver(leitor) {
        const margem = `${Math.round(window.innerHeight * 0.6)}px`;

        this._observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const img = entry.target;
                    if (!entry.isIntersecting) return;

                    if (img.dataset.src && !img.src) {
                        img.src = img.dataset.src;
                    }

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
                if (img.dataset.src && !img.src) img.src = img.dataset.src;
            }
        });
    }

    _atualizarProgresso() {
        if (!this.barraProgresso || !this.paginas.length) return;
        const pct = ((this._paginaAtual + 1) / this.paginas.length) * 100;
        this.barraProgresso.style.width = `${pct}%`;
    }

    destruir() {
        this._observer?.disconnect();
        this._observer = null;
    }
}
