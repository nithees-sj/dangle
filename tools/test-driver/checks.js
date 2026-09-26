// Checks run inside the headless shell. Each group receives the driver's ctx.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {sleep, waitFor} from './util.js';

const CORDS = 'a(ddsas)';

/** Counts actors below `actor`, skipping client windows (other processes come and go). */
function countActors(actor) {
    let n = 1;
    for (const child of actor.get_children()) {
        if (child !== global.window_group)
            n += countActors(child);
    }
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
    ctx.info('uiGroup before cycling', Main.layoutManager.uiGroup.get_children()
        .map(c => `${c.name || c.constructor.name}:${countActors(c)}`).join(' '));
    const uiBefore = ui.get_n_children();
    const grid = Main.panel.statusArea.quickSettings.menu._grid;
    const gridBefore = grid.get_n_children();
    const indicators = Main.panel.statusArea.quickSettings._indicators;
    const indicatorsBefore = indicators.get_n_children();
    let leftovers = 0, errors = 0;
    let orphanSources = 0;
    for (let i = 0; i < 20; i++) {
        const o = ctx.overlay();
        const sources = [o?._pollId, o?._gustId].filter(Boolean);
        Main.extensionManager.disableExtension(ctx.uuid);
        // eslint-disable-next-line no-await-in-loop
        await waitFor(() => ctx.dangle().state !== 1, 3000);
        leftovers += overlaysInUiGroup().length;
        orphanSources += sources.filter(id => GLib.MainContext.default().find_source_by_id(id)).length;
        Main.extensionManager.enableExtension(ctx.uuid);
        // eslint-disable-next-line no-await-in-loop
        await waitFor(() => ctx.dangle().state === 1, 3000);
        if (ctx.dangle().error)
            errors++;
    }
    ctx.check('20 enable/disable cycles leave no overlay behind while disabled', leftovers === 0, `${leftovers}`);
    ctx.check('no extension errors during cycling', errors === 0, ctx.dangle().error ?? '');
    ctx.check('no timers survive disable()', orphanSources === 0, `${orphanSources}`);
    ctx.check('exactly one overlay after cycling', overlaysInUiGroup().length === 1);
    ctx.check('uiGroup child count unchanged', ui.get_n_children() === uiBefore, `${uiBefore} → ${ui.get_n_children()}`);
    ctx.check('Quick Settings grid unchanged after cycling', grid.get_n_children() === gridBefore, `${gridBefore} → ${grid.get_n_children()}`);
    ctx.check('top-bar indicators unchanged after cycling', indicators.get_n_children() === indicatorsBefore);
    await waitFor(() => !ctx.overlay()?._timeline.is_playing(), 10000);
    const after = countActors(global.stage);
    if (after > before) {
        const parts = root => root.get_children().map(c => `${c.name || c.constructor.name}:${countActors(c)}`).join(' ');
        ctx.info('uiGroup after cycling', parts(Main.layoutManager.uiGroup));
    }
    ctx.check('stage actor count does not grow after cycling', after <= before, `${before} → ${after}`);
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
    await sleep(200); // let any restyle paint finish before counting
    s.frames = s.physicsUs = s.syncUs = s.repaints = 0;
    overlay.shake();
    await sleep(1000);
    const frames = Math.max(1, s.frames);
    const phys = s.physicsUs / frames / 1000, sync = s.syncUs / frames / 1000;
    ctx.info('overlay per frame (2 cords, shaking)',
             `physics ${phys.toFixed(3)} ms, actor updates ${sync.toFixed(3)} ms over ${s.frames} frames`);
    ctx.check('overlay physics + actor updates < 2 ms/frame', phys + sync < 2, `${(phys + sync).toFixed(3)} ms`);
    ctx.check('no CPU repaint while the ropes swing', s.repaints === 0, `${s.repaints} strip repaints`);
    await waitFor(() => !overlay._timeline.is_playing(), 10000);

    // Worst case: five cords with three charms each, all moving.
    const styles = ['gold-chain', 'neon', 'spider-thread', 'temple-thread', 'midnight-cord'];
    ctx.settings.set_value('cords', new GLib.Variant(CORDS, styles.map((style, i) =>
        [0.1 + i * 0.2, 150 + i * 20, style, ['builtin:star', 'builtin:crescent', 'builtin:star']])));
    await waitFor(() => !overlay._timeline.is_playing(), 10000);
    s.frames = s.physicsUs = s.syncUs = s.repaints = 0;
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

// ── phase 4: pointer, grab and flick, breeze ───────────────────────────────

// Virtual pointers take Clutter button numbers, not evdev codes.
const BTN_LEFT = Clutter.BUTTON_PRIMARY;

let virtualDevices = null;

function devices() {
    if (!virtualDevices) {
        const seat = Clutter.get_default_backend().get_default_seat();
        virtualDevices = {
            pointer: seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE),
            keyboard: seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE),
        };
    }
    return virtualDevices;
}

const now = () => GLib.get_monotonic_time();

async function moveTo(pointer, x, y) {
    pointer.notify_absolute_motion(now(), x, y);
    await sleep(20);
}

function bottomCharm(overlay, index = 0) {
    const cord = overlay._cords[index];
    const pose = cord.rope.charmPose(cord.rope.slots.length - 1);
    return {cord, x: pose.x, y: pose.y, actor: cord.charmActors.at(-1)};
}

async function pointer(ctx) {
    const overlay = ctx.overlay();
    const {pointer: dev} = devices();
    await waitFor(() => !overlay._timeline.is_playing(), 10000);

    await moveTo(dev, 300, 900);
    await sleep(600);
    ctx.check('pointer far away: poll every 250 ms', overlay._pollInterval === 250, `${overlay._pollInterval}`);

    const charm = bottomCharm(overlay);
    await moveTo(dev, charm.x + 45, charm.y);
    await sleep(600);
    ctx.check('pointer near the cords: poll every 50 ms', overlay._pollInterval === 50, `${overlay._pollInterval}`);
    ctx.check('near but no modifier: charms still let clicks through', !charm.actor.reactive);

    // Brush quickly across the charm (the poll is already at 50 ms here).
    for (let dx = 45; dx >= -45; dx -= 6)
        // eslint-disable-next-line no-await-in-loop
        await moveTo(dev, charm.x + dx, charm.y);
    await sleep(120);
    ctx.check('a passing pointer nudges the charm', !charm.cord.rope.isSleeping || overlay._timeline.is_playing());
    const ms = await waitFor(() => !overlay._timeline.is_playing(), 10000);
    ctx.check('settles again after a nudge', ms >= 0);

    // A plain click on a charm must reach whatever is underneath.
    const c2 = bottomCharm(overlay);
    await moveTo(dev, c2.x, c2.y);
    await sleep(120);
    dev.notify_button(now(), BTN_LEFT, Clutter.ButtonState.PRESSED);
    await sleep(60);
    const grabbedWithoutModifier = overlay._input.dragging;
    dev.notify_button(now(), BTN_LEFT, Clutter.ButtonState.RELEASED);
    await sleep(60);
    ctx.check('click without Super passes through (no grab)', !grabbedWithoutModifier);
    await moveTo(dev, 300, 900);
}

async function grab(ctx) {
    const overlay = ctx.overlay();
    const {pointer: dev, keyboard} = devices();
    await waitFor(() => !overlay._timeline.is_playing(), 10000);
    let overlayKey = 0;
    const id = global.display.connect('overlay-key', () => overlayKey++);

    // Approach, let any hover nudge die down, then press Super right on the charm.
    await moveTo(dev, bottomCharm(overlay).x, bottomCharm(overlay).y);
    await sleep(300);
    await waitFor(() => !overlay._timeline.is_playing(), 10000);
    const charm = bottomCharm(overlay);
    await moveTo(dev, charm.x, charm.y);
    keyboard.notify_keyval(now(), Clutter.KEY_Super_L, Clutter.KeyState.PRESSED);
    const armed = await waitFor(() => charm.actor.reactive, 1000);
    ctx.check('holding Super near a charm makes it grabbable', armed >= 0, armed >= 0 ? `${Math.round(armed)} ms` : 'never armed');

    dev.notify_button(now(), BTN_LEFT, Clutter.ButtonState.PRESSED);
    await sleep(60);
    ctx.check('Super+click grabs the charm', overlay._input.dragging && charm.cord.rope.isDragging,
              `input.dragging=${overlay._input.dragging} rope.isDragging=${charm.cord.rope?.isDragging}`);
    ctx.check('the drag holds a stage grab', overlay._input._grab !== null);
    for (let i = 1; i <= 8; i++)
        // eslint-disable-next-line no-await-in-loop
        await moveTo(dev, charm.x + i * 14, charm.y + i * 3);
    await sleep(40);
    const heldX = charm.cord.rope.x[charm.cord.rope.slots.at(-1).node];
    ctx.check('the charm follows the pointer', heldX > charm.x + 60, `moved ${Math.round(heldX - charm.x)} px`);
    // Flick: release while still moving.
    await moveTo(dev, charm.x + 130, charm.y + 26);
    dev.notify_button(now(), BTN_LEFT, Clutter.ButtonState.RELEASED);
    await sleep(30);
    keyboard.notify_keyval(now(), Clutter.KEY_Super_L, Clutter.KeyState.RELEASED);
    await sleep(700);

    ctx.check('release ends the drag and dismisses the grab', !overlay._input.dragging && overlay._input._grab === null);
    ctx.check('Super+click does NOT trigger the overlay key', overlayKey === 0, `${overlayKey} overlay-key signals`);
    ctx.check('Super+click does NOT open the overview', !Main.overview.visible);
    ctx.check('the flicked charm swings on', overlay._timeline.is_playing());
    await moveTo(dev, 300, 900);
    await sleep(400);
    ctx.check('charms disarmed after Super is released', !charm.actor.reactive);
    ctx.check('no stage event handler while disarmed', overlay._input._capturedId === 0);
    global.display.disconnect(id);
    if (Main.overview.visible) {
        Main.overview.hide();
        await waitFor(() => !Main.overview.visible, 3000);
    }
    await waitFor(() => !overlay._timeline.is_playing(), 10000);

    // "Grab without Super"
    ctx.settings.set_boolean('grab-without-super', true);
    const c2 = bottomCharm(overlay);
    await moveTo(dev, c2.x, c2.y);
    const armed2 = await waitFor(() => c2.actor.reactive, 1000);
    ctx.check('grab-without-super arms charms with no modifier', armed2 >= 0);

    // Hiding mid-drag must release everything.
    dev.notify_button(now(), BTN_LEFT, Clutter.ButtonState.PRESSED);
    await sleep(60);
    const dragging = overlay._input.dragging;
    ctx.settings.set_boolean('enabled', false);
    await sleep(60);
    ctx.check('hiding mid-drag ends the drag and the grab', dragging && !overlay._input.dragging && overlay._input._grab === null);
    dev.notify_button(now(), BTN_LEFT, Clutter.ButtonState.RELEASED);
    ctx.settings.set_boolean('enabled', true);
    ctx.settings.set_boolean('grab-without-super', false);
    await moveTo(dev, 300, 900);
    await sleep(400);
    ctx.check('grab-without-super off: charms let clicks through again', !c2.actor.reactive);

    // Alt as the modifier. (Releasing Super alone would open the overview, so
    // Super stays held until Alt has been pressed too.)
    ctx.settings.set_string('grab-modifier', 'alt');
    await moveTo(dev, c2.x, c2.y);
    keyboard.notify_keyval(now(), Clutter.KEY_Super_L, Clutter.KeyState.PRESSED);
    await sleep(200);
    const superArms = c2.actor.reactive;
    keyboard.notify_keyval(now(), Clutter.KEY_Alt_L, Clutter.KeyState.PRESSED);
    const altArms = await waitFor(() => c2.actor.reactive, 1000);
    keyboard.notify_keyval(now(), Clutter.KEY_Alt_L, Clutter.KeyState.RELEASED);
    keyboard.notify_keyval(now(), Clutter.KEY_Super_L, Clutter.KeyState.RELEASED);
    ctx.check('grab-modifier=alt: Alt arms, Super does not', !superArms && altArms >= 0,
              `super ${superArms}, alt ${altArms}`);
    ctx.settings.reset('grab-modifier');
    if (Main.overview.visible) {
        Main.overview.hide();
        await waitFor(() => !Main.overview.visible, 3000);
    }
    await moveTo(dev, 300, 900);
    await waitFor(() => !overlay._timeline.is_playing(), 10000);
}

async function breeze(ctx) {
    const overlay = ctx.overlay();
    // This machine may really be on battery; start from mains power.
    const realBattery = overlay._battery.onBattery;
    overlay._battery.onBattery = false;
    overlay._syncBreeze();
    await waitFor(() => !overlay._timeline.is_playing(), 10000);
    ctx.check('a gust is scheduled while the breeze is on', overlay._gustId !== 0);
    overlay.gust();
    await sleep(700);
    const moving = overlay._cords.some(c => !c.rope.isSleeping);
    ctx.check('a gust sways the charms', moving && overlay._timeline.is_playing());
    const ms = await waitFor(() => !overlay._timeline.is_playing(), 12000);
    ctx.check('everything sleeps after the gust', ms >= 0, ms >= 0 ? `${Math.round(ms)} ms after` : 'still playing');
    await ctx.screenshot('after-gust', 0, 0, 1920, 360);

    overlay._battery.onBattery = true;
    overlay._syncBreeze();
    ctx.check('on battery: no gusts scheduled', overlay._gustId === 0);
    ctx.settings.set_boolean('breeze-on-battery', true);
    await sleep(50);
    ctx.check('breeze-on-battery overrides', overlay._gustId !== 0);
    ctx.settings.reset('breeze-on-battery');
    await sleep(50);
    overlay._battery.onBattery = false;
    overlay._syncBreeze();
    ctx.settings.set_boolean('breeze-enabled', false);
    await sleep(50);
    ctx.check('breeze switch off: no gusts', overlay._gustId === 0);
    ctx.settings.reset('breeze-enabled');
    await sleep(50);
    ctx.check('breeze switch on again', overlay._gustId !== 0);
    overlay._battery.onBattery = realBattery;
    overlay._syncBreeze();
}

async function reducedMotion(ctx) {
    const overlay = ctx.overlay();
    const realBattery = overlay._battery.onBattery;
    overlay._battery.onBattery = false;
    overlay._syncBreeze();
    const iface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    iface.set_boolean('enable-animations', false);
    await waitFor(() => !St.Settings.get().enable_animations, 2000);
    await sleep(100);
    ctx.check('reduced motion reaches the ropes', overlay._cords.every(c => c.rope.reducedMotion));
    ctx.check('reduced motion: no breeze', overlay._gustId === 0);
    ctx.settings.set_boolean('respect-reduced-motion', false);
    await sleep(50);
    ctx.check('respect-reduced-motion off restores motion', overlay._cords.every(c => !c.rope.reducedMotion) && overlay._gustId !== 0);
    ctx.settings.reset('respect-reduced-motion');
    iface.reset('enable-animations');
    await waitFor(() => St.Settings.get().enable_animations, 2000);
    overlay._battery.onBattery = realBattery;
    overlay._syncBreeze();
}

async function styles(ctx) {
    const overlay = ctx.overlay();
    const all = ['thread', 'leather', 'gold-chain', 'silver-chain', 'neon', 'spider-thread', 'midnight-cord', 'temple-thread', 'silver-cord'];
    for (const [batch, list] of [[1, all.slice(0, 5)], [2, all.slice(5)]]) {
        ctx.settings.set_value('cords', new GLib.Variant(CORDS, list.map((style, i) =>
            [0.1 + i * 0.2, 160, style, i % 2 ? ['builtin:star', 'builtin:crescent'] : ['builtin:crescent']])));
        // eslint-disable-next-line no-await-in-loop
        await waitFor(() => !overlay._timeline.is_playing(), 10000);
        ctx.check(`style batch ${batch} applied`, overlay._cords.every((c, i) => c.rope.style === list[i]));
        // eslint-disable-next-line no-await-in-loop
        await ctx.screenshot(`styles-${batch}`, 0, 0, 1920, 260);
        // The same at the thickest setting, to inspect shading and textures.
        ctx.settings.set_double('rope-thickness', 2.5);
        // eslint-disable-next-line no-await-in-loop
        await waitFor(() => !overlay._timeline.is_playing(), 10000);
        // eslint-disable-next-line no-await-in-loop
        await ctx.screenshot(`styles-${batch}-thick`, 0, 0, 1920, 260);
        ctx.settings.reset('rope-thickness');
    }
    ctx.settings.reset('cords');
    await waitFor(() => !overlay._timeline.is_playing(), 10000);
}

// ── phase 6: Quick Settings ────────────────────────────────────────────────

const labelOf = item => item.label?.text ?? '';

async function quickSettings(ctx) {
    const ext = ctx.dangle().stateObj;
    const overlay = ctx.overlay();
    const qs = Main.panel.statusArea.quickSettings;
    const indicator = ext._indicator;
    ctx.check('indicator added to the top bar', !!indicator?.get_parent());
    const toggle = indicator.quickSettingsItems[0];
    ctx.check('toggle placed in the Quick Settings grid', toggle.get_parent() === qs.menu._grid);
    ctx.check('toggle title is "Dangle"', toggle.title === 'Dangle');
    ctx.check('subtitle shows the preset', toggle.subtitle === 'Minimal', toggle.subtitle);
    ctx.check('toggle reflects enabled', toggle.checked === true);
    ctx.check('top-bar icon visible while on', indicator.visible && indicator._indicator.visible);

    toggle.checked = false;
    await sleep(100);
    ctx.check('toggle off writes the setting', !ctx.settings.get_boolean('enabled'));
    ctx.check('toggle off hides every charm at once', !overlay.actor.visible && !overlay._timeline.is_playing());
    ctx.check('top-bar icon hidden while off', !indicator.visible);
    toggle.checked = true;
    await sleep(100);
    ctx.check('toggle on shows them again', overlay.actor.visible && indicator.visible);

    const items = toggle.menu._getMenuItems();
    const find = text => items.find(i => labelOf(i) === text);
    ctx.check('menu has the five presets', ['Festive', 'Temple', 'Minimal', 'Spooky', 'Custom'].every(t => find(t)));

    // Screenshot the open menu.
    qs.menu.open(false);
    toggle.menu.open(false);
    await sleep(400);
    await ctx.screenshot('quick-settings', 1920 - 700, 0, 700, 1000);

    find('Festive').emit('activate', Clutter.get_current_event());
    await sleep(150);
    ctx.check('preset Festive applies live', ctx.settings.get_string('preset') === 'festive' && overlay._cords.length === 5,
              `${ctx.settings.get_string('preset')} ${overlay._cords.length} cords`);
    ctx.check('subtitle follows the preset', toggle.subtitle === 'Festive');
    await sleep(600);
    await ctx.screenshot('quick-settings-festive', 1920 - 700, 0, 700, 1000);

    const styleItem = items.find(i => labelOf(i).startsWith('Rope style'));
    ctx.check('rope style submenu shows Mixed for mixed cords', labelOf(styleItem) === 'Rope style: Mixed', labelOf(styleItem));
    const neon = styleItem.menu._getMenuItems().find(i => labelOf(i) === 'Neon');
    ctx.check('submenu lists nine styles', styleItem.menu._getMenuItems().length === 9);
    neon.emit('activate', Clutter.get_current_event());
    await sleep(150);
    ctx.check('rope style applies to every cord', overlay._cords.every(c => c.rope.style === 'neon'));
    ctx.check('editing switches to the Custom preset', ctx.settings.get_string('preset') === 'custom');
    const fresh = ctx.dangle().stateObj.getSettings();
    ctx.check('edits reach dconf (visible to a separate settings object)',
              fresh.get_string('preset') === 'custom' && fresh.get_value('cords').deepUnpack().every(c => c[2] === 'neon'));
    ctx.check('submenu label shows the style', labelOf(styleItem) === 'Rope style: Neon');

    find('Remove cord').emit('activate', Clutter.get_current_event());
    await sleep(100);
    ctx.check('Remove cord', overlay._cords.length === 4);
    find('Add cord').emit('activate', Clutter.get_current_event());
    await sleep(100);
    ctx.check('Add cord', overlay._cords.length === 5);
    ctx.check('Add cord disabled at five', !find('Add cord').sensitive);

    await waitFor(() => !overlay._timeline.is_playing(), 10000);
    find('Shake them').emit('activate', Clutter.get_current_event());
    await sleep(100);
    ctx.check('Shake them sets every cord moving', overlay._timeline.is_playing() && overlay._cords.every(c => !c.rope.isSleeping));

    const breezeItem = find('Breeze');
    breezeItem.toggle();
    await sleep(50);
    ctx.check('Breeze switch writes the setting', !ctx.settings.get_boolean('breeze-enabled'));
    breezeItem.toggle();
    const grabItem = find('Grab without Super');
    ctx.check('"Grab without Super" switch present', !!grabItem);
    grabItem.toggle();
    await sleep(50);
    ctx.check('Grab without Super switch writes the setting', ctx.settings.get_boolean('grab-without-super'));
    grabItem.toggle();

    find('Custom').emit('activate', Clutter.get_current_event());
    await sleep(100);
    ctx.check('Custom restores the last custom layout', overlay._cords.length === 5 && overlay._cords.every(c => c.rope.style === 'neon'));

    toggle.menu.close(false);
    qs.menu.close(false);
    for (const key of ['preset', 'cords', 'custom-cords', 'breeze-enabled', 'grab-without-super'])
        ctx.settings.reset(key);
    await sleep(100);
    await waitFor(() => !overlay._timeline.is_playing(), 10000);
}

// ── phase 7: preferences ───────────────────────────────────────────────────

async function prefs(ctx) {
    const overlay = ctx.overlay();
    const launcher = new Gio.SubprocessLauncher({
        flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE,
    });
    // Shew (used by the Extensions app modules) lives with the shell's typelibs.
    launcher.setenv('GI_TYPELIB_PATH', '/usr/lib/gnome-shell/girepository-1.0', true);
    launcher.setenv('LD_LIBRARY_PATH', '/usr/lib/gnome-shell', true);
    const harness = ctx.driverDir.get_child('prefs-harness.js').get_path();
    const proc = launcher.spawnv(['gjs', '-m', harness, ctx.dangle().dir.get_path(), ctx.out]);
    const watchdog = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 90, () => {
        proc.force_exit();
        return GLib.SOURCE_REMOVE;
    });
    const output = await new Promise((resolve, reject) => {
        proc.communicate_utf8_async(null, null, (p, result) => {
            try {
                resolve(p.communicate_utf8_finish(result)[1] ?? '');
            } catch (e) {
                reject(e);
            }
        });
    });
    GLib.Source.remove(watchdog);
    ctx.check('preferences harness exited cleanly', proc.get_successful(),
              proc.get_successful() ? '' : output.split('\n').filter(l => l.includes('harness')).slice(-3).join(' | '));
    // (The isolated session has no accessibility bus; GTK's complaint about it is not ours.)
    const errors = output.split('\n').filter(l => /JS ERROR|CRITICAL|TypeError|ReferenceError/.test(l) && !/atspi/.test(l));
    ctx.check('no JS errors from the preferences window', errors.length === 0, errors.slice(0, 5).join(' | '));
    try {
        const [, bytes] = GLib.file_get_contents(GLib.build_filenamev([ctx.out, 'prefs-results.txt']));
        for (const line of new TextDecoder().decode(bytes).trim().split('\n')) {
            const [, kind, rest] = line.match(/^(\w+) (.*)$/) ?? [];
            if (kind === 'PASS' || kind === 'FAIL')
                ctx.check(`prefs: ${rest}`, kind === 'PASS');
        }
    } catch (e) {
        ctx.check('prefs harness wrote results', false, `${e.message}\n${output.slice(-2000)}`);
    }

    // The running overlay must have picked every change up live.
    await sleep(200);
    const cords = overlay._cords;
    const imported = cords[0].charmIds[0];
    ctx.check('overlay: shows an imported charm', imported.startsWith('custom:'), imported);
    const iconFile = cords[0].charmActors[0].gicon?.get_file?.();
    ctx.check('overlay: imported charm loads from the user data dir', !!iconFile?.query_exists(null) &&
        iconFile.get_path().startsWith(GLib.get_user_data_dir()), iconFile?.get_path());
    await ctx.screenshot('imported-charm', 0, 0, 1920, 360);
    ctx.check('overlay: cord length from prefs', Math.abs(cords[0].rope.length - 200) < 1e-6, `${cords[0].rope.length}`);
    ctx.check('overlay: style from prefs', cords[0].rope.style === 'gold-chain');
    ctx.check('overlay: charm from the library', cords[1].charmIds[0] === 'builtin:lotus', cords[1].charmIds.join());
    ctx.check('overlay: charm size from prefs', cords[1].charmActors[0].icon_size === 50, `${cords[1].charmActors[0].icon_size}`);
    ctx.check('overlay: shadow off from prefs', cords[0]._strips.shadow === false);
    for (const key of ['cords', 'custom-cords', 'preset', 'active-cord', 'charm-size', 'rope-thickness', 'shadow', 'grab-modifier'])
        ctx.settings.reset(key);
    await sleep(100);
    await waitFor(() => !overlay._timeline.is_playing(), 10000);
}

// ── phase 9: presets with the full charm set ───────────────────────────────

async function presets(ctx) {
    const overlay = ctx.overlay();
    const counts = {festive: 5, temple: 4, minimal: 2, spooky: 4};
    const settingsModel = await import(ctx.dangle().dir.get_child('settingsModel.js').get_uri());
    for (const [id, count] of Object.entries(counts)) {
        settingsModel.applyPreset(ctx.settings, id);
        // eslint-disable-next-line no-await-in-loop
        await sleep(100);
        ctx.check(`${id}: ${count} cords`, overlay._cords.length === count, `${overlay._cords.length}`);
        const files = overlay._cords.flatMap(c => c.charmActors.map(a => a.gicon.get_file()));
        ctx.check(`${id}: every charm has artwork`, files.every(f => f.query_exists(null)),
                  files.filter(f => !f.query_exists(null)).map(f => f.get_basename()).join());
        // eslint-disable-next-line no-await-in-loop
        await waitFor(() => !overlay._timeline.is_playing(), 10000);
        // eslint-disable-next-line no-await-in-loop
        await ctx.screenshot(`preset-${id}`, 0, 0, 1920, 330);
    }
    for (const key of ['preset', 'cords'])
        ctx.settings.reset(key);
    await sleep(100);
    await waitFor(() => !overlay._timeline.is_playing(), 10000);
}

// ── phase 10: real windows, fullscreen, timers, idle CPU ───────────────────

function spawnClient(ctx, mode) {
    const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE});
    return launcher.spawnv(['gjs', '-m', ctx.driverDir.get_child('client.js').get_path(), mode, ctx.out]);
}

function readClicks(ctx, mode) {
    try {
        const [, bytes] = GLib.file_get_contents(GLib.build_filenamev([ctx.out, `clicks-${mode}.txt`]));
        return Number(new TextDecoder().decode(bytes));
    } catch {
        return -1;
    }
}

const clientWindow = mode => global.display.list_all_windows().find(w => w.get_title() === `dangle-client-${mode}`);

async function click(dev, x, y) {
    await moveTo(dev, x, y);
    await sleep(80);
    dev.notify_button(now(), BTN_LEFT, Clutter.ButtonState.PRESSED);
    await sleep(40);
    dev.notify_button(now(), BTN_LEFT, Clutter.ButtonState.RELEASED);
    await sleep(200);
}

async function windows(ctx) {
    const overlay = ctx.overlay();
    const {pointer: dev, keyboard} = devices();

    // A maximized window right under the charms.
    const client = spawnClient(ctx, 'maximize');
    const shown = await waitFor(() => clientWindow('maximize')?.get_maximized?.() || clientWindow('maximize')?.is_maximized?.(), 8000);
    ctx.check('a maximized client window appears under the charms', shown >= 0);
    await sleep(500);
    await waitFor(() => !overlay._timeline.is_playing(), 10000);
    ctx.check('charms stay visible over a maximized window', overlay.actor.visible);
    const children = Main.layoutManager.uiGroup.get_children();
    ctx.check('charms are stacked above windows', children.indexOf(overlay.actor) > children.indexOf(global.window_group));

    const charm = bottomCharm(overlay);
    await click(dev, charm.x, charm.y);
    ctx.check('a click on a charm (no Super) reaches the window underneath', readClicks(ctx, 'maximize') === 1, `${readClicks(ctx, 'maximize')} clicks`);
    const rope = overlay._cords[0].rope;
    await click(dev, rope.x[5], rope.y[5]);
    ctx.check('a click on a rope reaches the window underneath', readClicks(ctx, 'maximize') === 2, `${readClicks(ctx, 'maximize')} clicks`);
    await click(dev, 960, 700);
    ctx.check('a click anywhere else reaches the window', readClicks(ctx, 'maximize') === 3);

    await moveTo(dev, charm.x, charm.y);
    await sleep(300);
    await waitFor(() => !overlay._timeline.is_playing(), 10000);
    const c2 = bottomCharm(overlay);
    await moveTo(dev, c2.x, c2.y);
    keyboard.notify_keyval(now(), Clutter.KEY_Super_L, Clutter.KeyState.PRESSED);
    await waitFor(() => c2.actor.reactive, 1000);
    dev.notify_button(now(), BTN_LEFT, Clutter.ButtonState.PRESSED);
    await sleep(60);
    const grabbed = overlay._input.dragging;
    await moveTo(dev, c2.x + 60, c2.y + 10);
    dev.notify_button(now(), BTN_LEFT, Clutter.ButtonState.RELEASED);
    keyboard.notify_keyval(now(), Clutter.KEY_Super_L, Clutter.KeyState.RELEASED);
    await sleep(300);
    ctx.check('Super+click over a window grabs the charm, not the window', grabbed && readClicks(ctx, 'maximize') === 3,
              `grabbed=${grabbed} clicks=${readClicks(ctx, 'maximize')}`);
    ctx.check('Super+click over a window does not open the overview', !Main.overview.visible);
    if (Main.overview.visible) {
        Main.overview.hide();
        await waitFor(() => !Main.overview.visible, 3000);
    }
    client.force_exit();
    await waitFor(() => !clientWindow('maximize'), 5000);
    await moveTo(dev, 300, 900);
    await waitFor(() => !overlay._timeline.is_playing(), 10000);

    // Fullscreen on the primary monitor hides and stops everything.
    const full = spawnClient(ctx, 'fullscreen');
    const hid = await waitFor(() => !overlay.actor.visible, 8000);
    ctx.check('a fullscreen window hides the charms', hid >= 0);
    ctx.check('…and stops all animation work', !overlay._timeline.is_playing() && overlay._pollId === 0 && overlay._gustId === 0);
    full.force_exit();
    const back = await waitFor(() => overlay.actor.visible, 8000);
    ctx.check('charms return when fullscreen ends', back >= 0);
    await waitFor(() => !overlay._timeline.is_playing(), 10000);
}

/** CPU time (utime + stime, in clock ticks) used by this gnome-shell process. */
function shellTicks() {
    const [, bytes] = GLib.file_get_contents('/proc/self/stat');
    const fields = new TextDecoder().decode(bytes).split(') ')[1].split(' ');
    return Number(fields[11]) + Number(fields[12]);
}

async function idleCpu(ctx) {
    const {pointer: dev} = devices();
    await moveTo(dev, 300, 900);
    await waitFor(() => !ctx.overlay()._timeline.is_playing(), 10000);
    await sleep(1000);
    const pid = String(new Gio.Credentials().get_unix_pid());
    const measure = async seconds => {
        let paints = 0;
        const id = global.stage.connect('after-paint', () => paints++);
        const t0 = shellTicks();
        await sleep(seconds * 1000);
        global.stage.disconnect(id);
        return {cpu: (shellTicks() - t0) / seconds, paints}; // 100 ticks/s = one core
    };
    const withCharms = await measure(20);
    ctx.check('idle with charms settled: timeline stayed stopped', !ctx.overlay()._timeline.is_playing());
    const top = await new Promise(resolve => {
        const proc = Gio.Subprocess.new(['top', '-b', '-d', '5', '-n', '2', '-p', pid], Gio.SubprocessFlags.STDOUT_PIPE);
        proc.communicate_utf8_async(null, null, (p, r) => resolve(p.communicate_utf8_finish(r)[1] ?? ''));
    });
    const topLine = top.trim().split('\n').filter(l => l.trim().startsWith(pid)).at(-1)?.trim().replace(/\s+/g, ' ') ?? 'n/a';
    ctx.info('top -p gnome-shell (5 s sample, charms idle)', topLine);

    Main.extensionManager.disableExtension(ctx.uuid);
    await waitFor(() => ctx.dangle().state !== 1, 3000);
    await sleep(1000);
    const without = await measure(20);
    Main.extensionManager.enableExtension(ctx.uuid);
    await waitFor(() => ctx.dangle().state === 1, 3000);
    ctx.info('gnome-shell idle over 20 s', `charms settled: ${withCharms.cpu.toFixed(2)}% CPU, ${withCharms.paints} repaints · ` +
        `Dangle disabled: ${without.cpu.toFixed(2)}% CPU, ${without.paints} repaints`);
    ctx.check('no repaints caused by idle charms', withCharms.paints <= without.paints + 1, `${withCharms.paints} vs ${without.paints}`);
    ctx.check('no extra CPU at idle (within 0.5% of a core)', withCharms.cpu - without.cpu < 0.5,
              `${(withCharms.cpu - without.cpu).toFixed(2)}%`);
    await waitFor(() => !ctx.overlay()?._timeline.is_playing(), 10000);
}

function monitors(ctx) {
    const overlay = ctx.overlay();
    const layout = Main.layoutManager;
    ctx.info('monitors', `${layout.monitors.map(m => `${m.width}x${m.height}+${m.x}+${m.y}`).join(', ')} primary=${layout.primaryIndex}`);
    const primary = layout.primaryMonitor;
    ctx.check('every cord hangs on the primary monitor', overlay._cords.every(c => c.rope.anchorX >= primary.x && c.rope.anchorX < primary.x + primary.width));
    const before = overlay._cords[0];
    layout.emit('monitors-changed');
    ctx.check('monitors-changed rebuilds the cords', overlay._cords[0] !== before && overlay._cords.length === 2);
}

// ── elastic pull: drag down, spring back ───────────────────────────────────

async function elastic(ctx) {
    const overlay = ctx.overlay();
    const {pointer: dev, keyboard} = devices();
    await moveTo(dev, 300, 900);
    await waitFor(() => !overlay._timeline.is_playing(), 10000);
    const cord = overlay._cords[0];
    const rope = cord.rope;
    const end = rope.pointCount - 1;
    const restY = rope.y[end];
    const charm = bottomCharm(overlay);

    await moveTo(dev, charm.x, charm.y);
    await sleep(300);
    await waitFor(() => !overlay._timeline.is_playing(), 10000);
    keyboard.notify_keyval(now(), Clutter.KEY_Super_L, Clutter.KeyState.PRESSED);
    await waitFor(() => charm.actor.reactive, 1000);
    dev.notify_button(now(), BTN_LEFT, Clutter.ButtonState.PRESSED);
    await sleep(60);
    ctx.check('Super+press grabs the charm for an elastic pull', overlay._input.dragging);
    // Pull straight down, well past the rope's own length.
    for (let i = 1; i <= 12; i++)
        // eslint-disable-next-line no-await-in-loop
        await moveTo(dev, charm.x, charm.y + i * 10);
    await sleep(500);
    const pulled = rope.y[end] - rope.anchorY, restDrop = restY - rope.anchorY;
    ctx.check('dragging down stretches the rope well past its own length', pulled > restDrop * 1.4,
              `${Math.round(pulled)} px vs ${Math.round(restDrop)} px at rest (elastic ${rope.elastic.toFixed(2)})`);
    ctx.check('…straight down, not sideways', Math.abs(rope.x[end] - rope.anchorX) < 6);
    await ctx.screenshot('elastic-pull', 0, 0, 1920, 420);
    dev.notify_button(now(), BTN_LEFT, Clutter.ButtonState.RELEASED);
    keyboard.notify_keyval(now(), Clutter.KEY_Super_L, Clutter.KeyState.RELEASED);
    await moveTo(dev, 300, 900);
    const ms = await waitFor(() => !overlay._timeline.is_playing(), 10000);
    ctx.check('on release it springs back and comes to rest', ms >= 0 && ms < 6000, `${Math.round(ms)} ms`);
    ctx.check('…at its original length', Math.abs(rope.y[end] - restY) < 3 && rope.elastic === 1,
              `${Math.round(rope.y[end] - rope.anchorY)} px vs ${Math.round(restDrop)} px`);
    if (Main.overview.visible) {
        Main.overview.hide();
        await waitFor(() => !Main.overview.visible, 3000);
    }
}

// ── "Open settings…" really opens the preferences window ───────────────────

const prefsWindow = () => global.display.list_all_windows().find(w => w.get_title() === 'Dangle');

async function openSettings(ctx) {
    const ext = ctx.dangle();
    const toggle = ext.stateObj._indicator.quickSettingsItems[0];
    const item = toggle.menu._getMenuItems().find(i => i.label?.text === 'Open settings…');
    ctx.check('"Open settings…" is in the menu', !!item);

    for (const [label, stale] of [['normally', false], ['even when the Shell thinks there are no prefs', true]]) {
        const real = ext.hasPrefs;
        if (stale)
            ext.hasPrefs = false; // what a session that scanned Dangle before prefs.js existed has
        item.emit('activate', Clutter.get_current_event());
        // eslint-disable-next-line no-await-in-loop
        const ms = await waitFor(() => !!prefsWindow(), 15000);
        ext.hasPrefs = real;
        ctx.check(`"Open settings…" opens the preferences window ${label}`, ms >= 0, ms >= 0 ? `${Math.round(ms)} ms` : 'no window');
        prefsWindow()?.delete(global.get_current_time());
        // eslint-disable-next-line no-await-in-loop
        await waitFor(() => !prefsWindow(), 5000);
        // eslint-disable-next-line no-await-in-loop
        await sleep(500);
    }
    if (Main.overview.visible) {
        Main.overview.hide();
        await waitFor(() => !Main.overview.visible, 3000);
    }
}

export const ALL_CHECKS = [
    ['structure', structure],
    ['sleep', sleeping],
    ['settings', settingsLive],
    ['visibility', visibility],
    ['styles', styles],
    ['presets', presets],
    ['quick-settings', quickSettings],
    ['prefs', prefs],
    ['open-settings', openSettings],
    ['pointer', pointer],
    ['grab', grab],
    ['elastic', elastic],
    ['breeze', breeze],
    ['reduced-motion', reducedMotion],
    ['windows', windows],
    ['monitors', monitors],
    ['perf', perf],
    ['idle-cpu', idleCpu],
    ['cycle', cycle],
];
