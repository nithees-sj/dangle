import GLib from 'gi://GLib';

export const sleep = ms => new Promise(resolve => {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    });
});

/** Polls `predicate` every 50 ms; resolves to the elapsed ms or -1 on timeout. */
export async function waitFor(predicate, timeoutMs) {
    const start = GLib.get_monotonic_time();
    for (;;) {
        if (predicate())
            return (GLib.get_monotonic_time() - start) / 1000;
        if ((GLib.get_monotonic_time() - start) / 1000 > timeoutMs)
            return -1;
        // eslint-disable-next-line no-await-in-loop
        await sleep(50);
    }
}
