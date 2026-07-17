#!/usr/bin/env node
/** @deprecated Use bots/nexustoons-akira/index.js */
import { main } from "../index.js";

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
