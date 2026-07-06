/** Estados globais de operações assíncronas — Loading | Error | Ready */
export function idleState() {
    return { status: "idle", data: null, error: null };
}
export function loadingState(prev) {
    return { ...prev, status: "loading", error: null };
}
export function readyState(data) {
    return { status: "ready", data, error: null };
}
export function errorState(message) {
    return { status: "error", data: null, error: message };
}
