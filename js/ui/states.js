/**
 * Estados visuais — loading, erro, vazio.
 */
import { escHtml } from "../app-shell.js";
import { renderLogoText } from "../brand.js";

export function renderLoading(msg = "A carregar...") {
    return `
    <div class="akira-state akira-state-loading" role="status" aria-live="polite">
        ${renderLogoText("header")}
        <div class="akira-spinner" aria-hidden="true"></div>
        <p>${escHtml(msg)}</p>
    </div>`;
}

export function renderError(message, { retryId = "btn-retry" } = {}) {
    return `
    <div class="akira-state akira-state-error" role="alert">
        <div class="akira-state-icon">⚠</div>
        <h2>Algo correu mal</h2>
        <p>${escHtml(message)}</p>
        <button type="button" class="btn-akira btn-akira-primary" id="${escHtml(retryId)}">Tentar novamente</button>
    </div>`;
}

export function renderEmpty(message = "Nenhum conteúdo encontrado.") {
    return `<p class="msg-vazia">${escHtml(message)}</p>`;
}

export function mountLoading(container, msg) {
    container.innerHTML = renderLoading(msg);
}

export function renderLeitorLoading(msg = "A carregar capítulo...") {
    return `
    <div class="leitor-estado akira-state-loading" role="status" aria-live="polite">
        <div class="akira-spinner" aria-hidden="true"></div>
        <h2>${escHtml(msg)}</h2>
    </div>`;
}

export function renderLeitorError(message, retryId = "leitor-retry") {
    return `
    <div class="leitor-estado akira-state-error" role="alert">
        <h2>Erro</h2>
        <p>${escHtml(message)}</p>
        <button class="btn-retry btn-akira btn-akira-primary" type="button" id="${escHtml(retryId)}">Tentar de novo</button>
    </div>`;
}

export function mountLeitorLoading(container, msg) {
    container.innerHTML = renderLeitorLoading(msg);
}

export function mountLeitorError(container, message, onRetry) {
    container.innerHTML = renderLeitorError(message);
    container.querySelector("#leitor-retry")?.addEventListener("click", onRetry);
}

export function mountError(container, message, onRetry) {
    container.innerHTML = renderError(message);
    container.querySelector("#btn-retry")?.addEventListener("click", onRetry);
}
