// Appearance page: sizes, shadow, breeze, grabbing and reduced motion.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

const MODIFIERS = [['super', 'Super'], ['alt', 'Alt'], ['ctrl-alt', 'Ctrl+Alt']];

function switchRow(settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

export function appearancePage(model) {
    const settings = model.settings;
    const page = new Adw.PreferencesPage({title: 'Appearance', icon_name: 'applications-graphics-symbolic', name: 'appearance'});

    // ── look ───────────────────────────────────────────────────────────────
    const look = new Adw.PreferencesGroup({title: 'Look'});
    const size = new Adw.SpinRow({
        title: 'Charm size',
        subtitle: 'Diameter of a lone charm, in pixels',
        adjustment: new Gtk.Adjustment({lower: 24, upper: 96, step_increment: 2, page_increment: 8}),
    });
    size.value = settings.get_int('charm-size');
    size.connect('notify::value', () => settings.set_int('charm-size', Math.round(size.value)));
    model.watch('charm-size', () => {
        if (Math.round(size.value) !== settings.get_int('charm-size'))
            size.value = settings.get_int('charm-size');
    });
    look.add(size);

    const thickness = new Adw.SpinRow({
        title: 'Rope thickness',
        subtitle: 'Multiplies each rope style’s own width',
        digits: 1,
        adjustment: new Gtk.Adjustment({lower: 0.5, upper: 2.5, step_increment: 0.1, page_increment: 0.5}),
    });
    settings.bind('rope-thickness', thickness, 'value', Gio.SettingsBindFlags.DEFAULT);
    look.add(thickness);
    look.add(switchRow(settings, 'shadow', 'Shadow', 'A soft shadow under each rope'));
    page.add(look);

    // ── breeze ─────────────────────────────────────────────────────────────
    const breeze = new Adw.PreferencesGroup({title: 'Breeze', description: 'A short gust every 45 to 120 seconds.'});
    breeze.add(switchRow(settings, 'breeze-enabled', 'Breeze', null));
    const strengthRow = new Adw.ActionRow({title: 'Strength'});
    const strength = new Gtk.Scale({
        adjustment: new Gtk.Adjustment({lower: 0, upper: 1, step_increment: 0.05, page_increment: 0.1}),
        draw_value: false,
        hexpand: true,
        valign: Gtk.Align.CENTER,
        width_request: 200,
    });
    settings.bind('breeze-strength', strength.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
    settings.bind('breeze-enabled', strengthRow, 'sensitive', Gio.SettingsBindFlags.GET);
    strengthRow.add_suffix(strength);
    breeze.add(strengthRow);
    breeze.add(switchRow(settings, 'breeze-on-battery', 'Breeze on battery',
                         'Off by default: gusts pause while the laptop is unplugged'));
    page.add(breeze);

    // ── grabbing ───────────────────────────────────────────────────────────
    const grab = new Adw.PreferencesGroup({
        title: 'Grabbing',
        description: 'Charms let clicks through to your windows unless the modifier is held.',
    });
    const modifier = new Adw.ComboRow({
        title: 'Grab modifier',
        subtitle: 'Hold this and drag a charm to pull and flick it',
        model: Gtk.StringList.new(MODIFIERS.map(m => m[1])),
    });
    const syncModifier = () => {
        const index = MODIFIERS.findIndex(m => m[0] === settings.get_string('grab-modifier'));
        if (modifier.selected !== Math.max(0, index))
            modifier.selected = Math.max(0, index);
    };
    syncModifier();
    modifier.connect('notify::selected', () => settings.set_string('grab-modifier', MODIFIERS[modifier.selected][0]));
    model.watch('grab-modifier', syncModifier);
    grab.add(modifier);
    grab.add(switchRow(settings, 'grab-without-super', 'Grab without the modifier',
                       'Charms always catch clicks (the ropes never do)'));
    page.add(grab);

    // ── accessibility ──────────────────────────────────────────────────────
    const a11y = new Adw.PreferencesGroup({title: 'Accessibility'});
    a11y.add(switchRow(settings, 'respect-reduced-motion', 'Respect reduced motion',
                       'When system animations are off, charms hang still: no breeze or nudges'));
    page.add(a11y);

    return page;
}
