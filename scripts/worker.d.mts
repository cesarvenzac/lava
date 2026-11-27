/** The worker, bundled into one script's source. */
export function workerSource(): Promise<string>;
/** That source as the module src/worker-code.ts holds. */
export function moduleOf(source: string): string;
