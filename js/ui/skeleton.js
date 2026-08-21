/**
 * Skeleton loading — placeholders animados
 */

export function skeletonCard() {
    return `
    <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton-shimmer skeleton-capa"></div>
        <div class="skeleton-shimmer skeleton-line skeleton-line-lg"></div>
        <div class="skeleton-shimmer skeleton-line skeleton-line-sm"></div>
    </div>`;
}

export function skeletonGrid(n = 8) {
    return `<div class="skeleton-grid">${Array.from({ length: n }, skeletonCard).join("")}</div>`;
}

export function skeletonFeed(n = 6) {
    return `<div class="skeleton-feed">${Array.from({ length: n }, () => `
        <div class="skeleton-feed-row" aria-hidden="true">
            <div class="skeleton-shimmer skeleton-thumb"></div>
            <div class="skeleton-feed-lines">
                <div class="skeleton-shimmer skeleton-line skeleton-line-lg"></div>
                <div class="skeleton-shimmer skeleton-line skeleton-line-sm"></div>
            </div>
        </div>`).join("")}</div>`;
}

export function mountSkeletonGrid(container, n = 8) {
    if (container) container.innerHTML = skeletonGrid(n);
}

export function mountSkeletonFeed(container, n = 6) {
    if (container) container.innerHTML = skeletonFeed(n);
}
