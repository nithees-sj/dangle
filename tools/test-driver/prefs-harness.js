// Development only. Opens Dangle's preferences in GNOME's real
// ExtensionPrefsDialog (loaded from the org.gnome.Shell.Extensions resource),
// renders every page to PNG, drives a few widgets and records what happened.
// Spawned by the test driver inside the headless shell:
//
//   gjs -m prefs-harness.js <extension dir> <out dir>

import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';

const [extensionPath, outDir] = ARGV;
const lines = [];
const record = (kind, name, detail = '') => lines.push(`${kind} ${name}${detail ? `: ${detail}` : ''}`);
const check = (name, ok, detail) => {
    record(ok ? 'PASS' : 'FAIL', name, detail);
    printerr(`harness: ${ok ? 'PASS' : 'FAIL'} ${name}`);
};

for (const bundle of ['org.gnome.Shell.Extensions.src.gresource', 'gnome-shell-dbus-interfaces.gresource'])
    Gio.Resource.load(`/usr/share/gnome-shell/${bundle}`)._register();

printerr('harness: resources registered');
const {ExtensionPrefsDialog} = await import('resource:///org/gnome/Shell/Extensions/js/extensionPrefsDialog.js');

printerr('harness: dialog module imported');
const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve();
    return GLib.SOURCE_REMOVE;
}));

function findAll(widget, predicate, found = []) {
    if (predicate(widget))
        found.push(widget);
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling())
        findAll(child, predicate, found);
    return found;
}

function snapshot(window, name) {
    const paintable = new Gtk.WidgetPaintable({widget: window});
    const width = window.get_width(), height = window.get_height();
    const snap = new Gtk.Snapshot();
    paintable.snapshot(snap, width, height);
    const node = snap.to_node();
    if (!node)
        return;
    const texture = window.get_native().get_renderer().render_texture(node, null);
    texture.save_to_png(GLib.build_filenamev([outDir, `prefs-${name}.png`]));
}

async function run(window) {
    const settings = window._dangleModel.settings;
    check('preferences window filled', !!window.visible_page);
    const pages = ['library', 'cords', 'appearance', 'about'];
    for (const name of pages) {
        window.visible_page_name = name;
        // eslint-disable-next-line no-await-in-loop
        await wait(400);
        check(`page "${name}" present`, window.visible_page_name === name);
        snapshot(window, name);
    }

    // Library: select the second cord, bottom slot, and click the Lotus tile.
    window.visible_page_name = 'library';
    await wait(200);
    const library = window.visible_page;
    library._dangle.cordRow.selected = 1;
    await wait(100);
    check('library edits the chosen cord', settings.get_int('active-cord') === 1);
    const tile = findAll(library._dangle.flow, w => w._dangleCharm === 'builtin:lotus')[0];
    tile.emit('clicked');
    await wait(150);
    const cords = settings.get_value('cords').deepUnpack();
    check('clicking a library charm assigns it to the slot', cords[1][3][0] === 'builtin:lotus', JSON.stringify(cords[1][3]));
    check('an edit switches the preset to Custom', settings.get_string('preset') === 'custom');

    // Cords page: change cord 1's length and style through the widgets.
    window.visible_page_name = 'cords';
    await wait(200);
    const cordsPage = window.visible_page;
    const spins = findAll(cordsPage, w => w instanceof Adw.SpinRow);
    const lengthRow = spins.find(w => w.title === 'Length');
    lengthRow.value = 200;
    await wait(100);
    check('length spin writes the cord', settings.get_value('cords').deepUnpack()[0][1] === 200);
    const styleRow = findAll(cordsPage, w => w instanceof Adw.ComboRow && w.title === 'Rope style')[0];
    styleRow.selected = 2; // Gold Chain
    await wait(100);
    check('style combo writes the cord', settings.get_value('cords').deepUnpack()[0][2] === 'gold-chain');

    // Preset combo: switch to Spooky and back to Custom through the widget.
    const presetRow = findAll(cordsPage, w => w instanceof Adw.ComboRow && w.title === 'Layout')[0];
    presetRow.selected = 2; // Spooky
    await wait(150);
    check('preset combo applies Spooky', settings.get_string('preset') === 'spooky' &&
        settings.get_value('cords').deepUnpack().length === 4);
    presetRow.selected = 3; // Custom
    await wait(150);
    check('preset combo restores Custom', settings.get_string('preset') === 'custom' &&
        settings.get_value('cords').deepUnpack()[0][2] === 'gold-chain');

    // Appearance page: charm size and shadow.
    window.visible_page_name = 'appearance';
    await wait(200);
    const appearance = window.visible_page;
    findAll(appearance, w => w instanceof Adw.SpinRow && w.title === 'Charm size')[0].value = 60;
    const shadow = findAll(appearance, w => w instanceof Adw.SwitchRow && w.title === 'Shadow')[0];
    shadow.active = false;
    await wait(100);
    check('charm size spin writes the setting', settings.get_int('charm-size') === 60);
    check('shadow switch writes the setting', settings.get_boolean('shadow') === false);
    const modifier = findAll(appearance, w => w instanceof Adw.ComboRow && w.title === 'Grab modifier')[0];
    modifier.selected = 2;
    await wait(100);
    check('grab modifier combo writes the setting', settings.get_string('grab-modifier') === 'ctrl-alt');

    // An outside change (e.g. from Quick Settings) must show up in the pages.
    settings.set_int('charm-size', 50);
    await wait(100);
    check('outside changes show up live', Math.round(findAll(appearance, w => w instanceof Adw.SpinRow && w.title === 'Charm size')[0].value) === 50);
    snapshot(window, 'appearance-after');
}

// Never hang the test run.
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
    record('FAIL', 'prefs harness', 'timed out');
    GLib.file_set_contents(GLib.build_filenamev([outDir, 'prefs-results.txt']), `${lines.join('\n')}\n`);
    imports.system.exit(1);
});

const app = new Adw.Application({application_id: 'org.dangle.PrefsHarness', flags: Gio.ApplicationFlags.NON_UNIQUE});
app.connect('activate', () => {
    printerr('harness: activate');
    const dir = Gio.File.new_for_path(extensionPath);
    const [, bytes] = GLib.file_get_contents(dir.get_child('metadata.json').get_path());
    const metadata = JSON.parse(new TextDecoder().decode(bytes));
    const window = new ExtensionPrefsDialog({uuid: metadata.uuid, dir, path: extensionPath, metadata});
    window.set_application(app);
    printerr('harness: dialog created');
    window.connect('loaded', () => {
        printerr('harness: loaded');
        window.present();
        wait(800)
            .then(() => run(window))
            .catch(e => record('FAIL', 'prefs harness', `${e}\n${e.stack}`))
            .finally(() => {
                GLib.file_set_contents(GLib.build_filenamev([outDir, 'prefs-results.txt']), `${lines.join('\n')}\n`);
                window.close();
                app.quit();
            });
    });
});
// runAsync, not run: a blocked main module never resolves the dialog's import().
await app.runAsync([]);
