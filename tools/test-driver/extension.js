// Development-only test driver. Runs inside a headless GNOME Shell started by
// tools/headless-test.sh, exercises Dangle for real, writes results and
// screenshots to $DANGLE_TEST_OUT, then terminates the shell. Never shipped.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ALL_CHECKS} from './checks.js';
import {waitFor} from './util.js';

const UUID = 'dangle@nithees';

// Disabling Dangle re-enables extensions loaded after it; run only once.
let started = false;

export default class DangleTestDriver extends Extension {
    enable() {
        if (started)
            return;
        started = true;
        this._out = GLib.getenv('DANGLE_TEST_OUT') ?? GLib.get_tmp_dir();
        this._lines = [];
        const start = () => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            this._run();
            return GLib.SOURCE_REMOVE;
        });
        if (Main.layoutManager._startingUp)
            Main.layoutManager.connect('startup-complete', start);
        else
            start();
    }

    disable() {}

    async _run() {
        const ctx = {
            uuid: UUID,
            out: this._out,
            check: (name, ok, detail = '') => this._record(ok ? 'PASS' : 'FAIL', name, detail),
            info: (name, detail) => this._record('INFO', name, detail),
            dangle: () => Main.extensionManager.lookup(UUID),
            overlay: () => Main.extensionManager.lookup(UUID)?.stateObj?._overlay ?? null,
            settings: null,
            screenshot: (name, x, y, w, h) => this._screenshot(name, x, y, w, h),
        };
        try {
            // The shell starts in the overview; the charms only show outside it.
            Main.overview.hide();
            await waitFor(() => !Main.overview.visible, 5000);
            const ext = ctx.dangle();
            ctx.check('dangle loaded and active', ext?.state === 1, `state=${ext?.state} error=${ext?.error}`);
            ctx.settings = ext.stateObj.getSettings();
            const only = GLib.getenv('DANGLE_TEST_ONLY');
            for (const [name, fn] of ALL_CHECKS) {
                if (only && !only.split(',').includes(name))
                    continue;
                ctx.info('group', name);
                // eslint-disable-next-line no-await-in-loop
                await fn(ctx);
            }
        } catch (e) {
            this._record('FAIL', 'uncaught', `${e}\n${e.stack}`);
        }
        this._finish();
    }

    _record(kind, name, detail) {
        const line = `${kind} ${name}${detail ? `: ${detail}` : ''}`;
        this._lines.push(line);
        console.log(`DANGLE-TEST ${line}`);
    }

    async _screenshot(name, x, y, width, height) {
        const file = Gio.File.new_for_path(GLib.build_filenamev([this._out, `${name}.png`]));
        const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
        try {
            await new Shell.Screenshot().screenshot_area(x, y, width, height, stream);
        } finally {
            stream.close(null);
        }
    }

    _finish() {
        const text = `${this._lines.join('\n')}\n`;
        GLib.file_set_contents(GLib.build_filenamev([this._out, 'results.txt']), text);
        global.context.terminate();
    }
}
