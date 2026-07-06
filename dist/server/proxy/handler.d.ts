import { toCanonical } from "../../shared/schema.js";
export declare function handleProxyRequest(req: Request): Promise<Response>;
/** Netlify Function default export */
export default handleProxyRequest;
export declare const config: {
    path: string;
};
export { toCanonical };
