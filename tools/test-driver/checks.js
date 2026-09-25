// Checks run inside the headless shell. Each group receives the driver's ctx.

import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {sleep, waitFor} from './util.js';

const CORDS = 'a(ddsas)';

function countActors(actor) {
    let n = 1;
    for (const child of actor.get_children())
        n += countActors(child);
    return n;
}

const overlaysInUiGroup = () =>
    Main.layoutManager.uiGroup.get_children().filter(a => a.name === 'dangle-overlay');

function structure(ctx) {
    const overlay = ctx.overlay();
    ctx.check('overlay object exists', !!overlay);
    const actors = overlaysInUiGroup();
    ctx.check('exactly one overlay actor in uiGroup', actors.length === 1, `found ${actors.length}`);
    const children = Main.layoutManager.uiGroup.get_children();
    const idx = children.indexOf(actors[0]);
    ctx.check('overlay directly above window_group', idx === children.indexOf(global.window_group) + 1,
              `overlay ${idx}, window_group ${children.indexOf(global.window_group)}`);
    ctx.check('overlay below panelBox', idx < children.indexOf(Main.layoutManager.panelBox));
    ctx.check('overlay below modalDialogGroup', idx < children.indexOf(Main.layoutManager.modalDialogGroup));
    ctx.check('overlay actor not reactive', actors[0] && !actors[0].reactive);
    const cords = overlay?._cords ?? [];
    ctx.check('two cords from the Minimal default', cords.length === 2, `${cords.length}`);
    const panel = Main.layoutManager.panelBox;
    const bottom = panel.y + panel.height;
    for (const [i, cord] of cords.entries()) {
        ctx.check(`cord ${i} anchored at the panel bottom`, Math.abs(cord.rope.anchorY - bottom) < 0.5,
                  `anchor ${cord.rope.anchorY}, panel bottom ${bottom}`);
        const ropeActors = cord.actor.get_children().filter(a => !cord.charmActors.includes(a));
        ctx.check(`cord ${i} rope actors not reactive`, ropeActors.every(a => !a.reactive) && !cord.actor.reactive);
        ctx.check(`cord ${i} charms not reactive by default`, cord.charmActors.every(a => !a.reactive));
    }
}

async function sleeping(ctx) {
    const overlay = ctx.overlay();
    const ms = await waitFor(() => !overlay._timeline.is_playing(), 10000);
    ctx.check('timeline stops once the charms settle', ms >= 0, ms < 0 ? 'still playing after 10 s' : `${Math.round(ms)} ms`);
    await ctx.screenshot('settled', 0, 0, 1920, 360);
    await sleep(3000);
    ctx.check('timeline stays stopped while idle', !overlay._timeline.is_playing());
    const largest = Math.max(...overlay.actor.get_children().flatMap(c => c.get_children()).map(a => a.width * a.height));
    ctx.check('no large canvases: every rope/charm actor is small', largest < 100 * 100, `largest ${Math.round(largest)} px²`);
}

async function settingsLive(ctx) {
    const overlay = ctx.overlay();
    const s = ctx.settings;
    const cords = [
        [0.2, 150, 'gold-chain', ['builtin:star', 'builtin:crescent']],
        [0.5, 110, 'neon', ['builtin:crescent']],
        [0.8, 200, 'temple-thread', ['builtin:star', 'builtin:star', 'builtin:crescent']],
    ];
    s.set_value('cords', new GLib.Variant(CORDS, cords));
    await sleep(100);
    ctx.check('changing cords applies live', overlay._cords.length === 3, `${overlay._cords.length}`);
    ctx.check('a settings change wakes the timeline', overlay._timeline.is_playing());
    ctx.check('stacked charms created', overlay._cords[2].charmActors.length === 3);
    ctx.check('style applied', overlay._cords[1].rope.style === 'neon');
    const ms = await waitFor(() => !overlay._timeline.is_playing(), 10000);
    ctx.check('sleeps again after the change', ms >= 0);
    await ctx.screenshot('three-cords', 0, 0, 1920, 400);

    s.set_int('charm-size', 64);
    await sleep(50);
    ctx.check('charm size applies live', overlay._cords[1].charmActors[0].icon_size === 64,
              `${overlay._cords[1].charmActors[0].icon_size}`);
    s.reset('charm-size');
    s.reset('cords');
    await sleep(100);
    ctx.check('reset back to two cords', overlay._cords.length === 2);
    await waitFor(() => !overlay._timeline.is_playing(), 10000);
}

async function visibility(ctx) {
    const overlay = ctx.overlay();
    const s = ctx.settings;
    s.set_boolean('enabled', false);
    await sleep(100);
    ctx.check('toggle off hides the overlay', !overlay.actor.visible);
    ctx.check('toggle off stops the timeline', !overlay._timeline.is_playing());
    s.set_boolean('enabled', true);
    await sleep(100);
    ctx.check('toggle on shows the overlay', overlay.actor.visible);

    Main.overview.show();
    const shown = await waitFor(() => !overlay.actor.visible, 3000);
    ctx.check('overview hides the charms', shown >= 0);
    Main.overview.hide();
    const hidden = await waitFor(() => overlay.actor.visible, 5000);
    ctx.check('charms return after the overview', hidden >= 0);
    await waitFor(() => !overlay._timeline.is_playing(), 10000);
}

async function cycle(ctx) {
    const ui = Main.layoutManager.uiGroup;
    const before = countActors(global.stage);
    const uiBefore = ui.get_n_children();
    let leftovers = 0, errors = 0;
    for (let i = 0; i < 20; i++) {
        Main.extensionManager.disableExtension(ctx.uuid);
        // eslint-disable-next-line no-await-in-loop
        await waitFor(() => ctx.dangle().state !== 1, 3000);
        leftovers += overlaysInUiGroup().length;
        Main.extensionManager.enableExtension(ctx.uuid);
        // eslint-disable-next-line no-await-in-loop
        await waitFor(() => ctx.dangle().state === 1, 3000);
        if (ctx.dangle().error)
            errors++;
    }
    ctx.check('20 enable/disable cycles leave no overlay behind while disabled', leftovers === 0, `${leftovers}`);
    ctx.check('no extension errors during cycling', errors === 0, ctx.dangle().error ?? '');
    ctx.check('exactly one overlay after cycling', overlaysInUiGroup().length === 1);
    ctx.check('uiGroup child count unchanged', ui.get_n_children() === uiBefore, `${uiBefore} → ${ui.get_n_children()}`);
    await waitFor(() => !ctx.overlay()?._timeline.is_playing(), 10000);
    const after = countActors(global.stage);
    ctx.check('stage actor count unchanged after cycling', after === before, `${before} → ${after}`);
}

/** The node bench, run inside the shell's own JS engine. */
async function perf(ctx) {
    const core = ctx.dangle().dir.get_child('core');
    const {Rope} = await import(core.get_child('rope.js').get_uri());
    const {STYLE_IDS} = await import(core.get_child('ropeStyles.js').get_uri());
    const ropes = [];
    for (let c = 0; c < 5; c++) {
        ropes.push(new Rope({
            anchorX: 300 + c * 250, anchorY: 32, length: 140 + c * 30,
            style: STYLE_IDS[(c * 2) % 9], charmCount: 3,
        }));
    }
    let total = 0;
    for (let f = 0; f < 660; f++) {
        if (f % 45 === 0)
            ropes[(f / 45) % 5].push(f % 90 ? 1 : -1);
        const t0 = GLib.get_monotonic_time();
        for (const r of ropes) {
            r.setWind(120 * Math.sin(f / 20), 0);
            r.step(1 / 60);
        }
        if (f >= 60)
            total += GLib.get_monotonic_time() - t0;
    }
    const ms = total / 600 / 1000;
    ctx.check('in-shell physics bench (5 cords × 3 charms) ≤ 1 ms/frame', ms <= 1, `${ms.toFixed(3)} ms/frame`);

    // Real overlay: shake the default cords and read the debug timers.
    const overlay = ctx.overlay();
    const s = overlay._stats;
    s.frames = s.physicsUs = s.syncUs = s.repaintUs = s.repaints = 0;
    overlay.shake();
    await sleep(1000);
    const frames = Math.max(1, s.frames);
    const phys = s.physicsUs / frames / 1000, sync = s.syncUs / frames / 1000, paint = s.repaintUs / frames / 1000;
    ctx.info('overlay per frame (2 cords, shaking)',
             `physics ${phys.toFixed(3)} ms, actor sync ${sync.toFixed(3)} ms, repaint ${paint.toFixed(3)} ms over ${s.frames} frames`);
    ctx.check('overlay physics + repaint < 2 ms/frame', phys + sync + paint < 2, `${(phys + sync + paint).toFixed(3)} ms`);
    ctx.check('repaint ≤ 1 ms/frame', paint <= 1, `${paint.toFixed(3)} ms`);
    await waitFor(() => !overlay._timeline.is_playing(), 10000);

    // Worst case: five cords with three charms each, all moving.
    const styles = ['gold-chain', 'neon', 'spider-thread', 'temple-thread', 'midnight-cord'];
    ctx.settings.set_value('cords', new GLib.Variant(CORDS, styles.map((style, i) =>
        [0.1 + i * 0.2, 150 + i * 20, style, ['builtin:star', 'builtin:crescent', 'builtin:star']])));
    await waitFor(() => !overlay._timeline.is_playing(), 10000);
    s.frames = s.physicsUs = s.syncUs = s.repaintUs = s.repaints = 0;
    overlay.shake();
    await sleep(1500);
    const n = Math.max(1, s.frames);
    const p5 = s.physicsUs / n / 1000, s5 = s.syncUs / n / 1000;
    ctx.info('overlay per frame (5 cords × 3 charms, shaking)', `physics ${p5.toFixed(3)} ms, actor sync ${s5.toFixed(3)} ms over ${s.frames} frames`);
    ctx.check('5 × 3 worst case: physics + actor updates < 2 ms/frame', p5 + s5 < 2, `${(p5 + s5).toFixed(3)} ms`);
    await ctx.screenshot('five-cords-moving', 0, 0, 1920, 420);

    // Isolate: the same five ropes stepped by hand, with and without actor updates.
    await waitFor(() => !overlay._timeline.is_playing(), 10000);
    overlay._timeline.stop();
    const time = withSync => {
        overlay._cords.forEach((c, i) => c.rope.push(i % 2 ? -1 : 1));
        let us = 0;
        for (let f = 0; f < 90; f++) {
            const t0 = GLib.get_monotonic_time();
            for (const c of overlay._cords) {
                c.rope.step(1 / 60);
                if (withSync)
                    c.sync();
            }
            us += GLib.get_monotonic_time() - t0;
        }
        return us / 90 / 1000;
    };
    time(false);
    const bare = time(false), synced = time(true);
    ctx.info('manual 5 × 3 stepping', `physics only ${bare.toFixed(3)} ms/frame, with actor sync ${synced.toFixed(3)} ms/frame`);
    ctx.settings.reset('cords');
    await waitFor(() => !overlay._timeline.is_playing(), 10000);
}

export const ALL_CHECKS = [
    ['structure', structure],
    ['sleep', sleeping],
    ['settings', settingsLive],
    ['visibility', visibility],
    ['perf', perf],
    ['cycle', cycle],
];
