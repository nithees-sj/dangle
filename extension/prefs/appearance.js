// Appearance page: sizes, shadow, breeze, grabbing and reduced motion.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {sliderRow} from './widgets.js';

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
    const size = sliderRow({
        title: 'Charm size',
        subtitle: 'Diameter of a lone charm',
        lower: 24,
        upper: 96,
        step: 2,
        value: settings.get_int('charm-size'),
        format: v => `${v} px`,
        onChange: v => settings.set_int('charm-size', v),
    });
    model.watch('charm-size', () => size.setValue(settings.get_int('charm-size')));
    look.add(size);

    const thickness = sliderRow({
        title: 'Rope thickness',
        subtitle: 'Multiplies each rope style’s own width',
        lower: 0.5,
        upper: 2.5,
        step: 0.1,
        value: settings.get_double('rope-thickness'),
        format: v => `${v.toFixed(1)}×`,
        marks: [1],
        onChange: v => settings.set_double('rope-thickness', v),
    });
    model.watch('rope-thickness', () => thickness.setValue(settings.get_double('rope-thickness')));
    look.add(thickness);
    look.add(switchRow(settings, 'shadow', 'Shadow', 'A soft shadow under each rope'));
    page.add(look);

    // ── breeze ─────────────────────────────────────────────────────────────
    const breeze = new Adw.PreferencesGroup({title: 'Breeze', description: 'A short gust every 45 to 120 seconds.'});
    breeze.add(switchRow(settings, 'breeze-enabled', 'Breeze', null));
    const strength = sliderRow({
        title: 'Strength',
        lower: 0,
        upper: 1,
        step: 0.05,
        value: settings.get_double('breeze-strength'),
        format: v => `${Math.round(v * 100)} %`,
        onChange: v => settings.set_double('breeze-strength', v),
    });
    model.watch('breeze-strength', () => strength.setValue(settings.get_double('breeze-strength')));
    settings.bind('breeze-enabled', strength, 'sensitive', Gio.SettingsBindFlags.GET);
    breeze.add(strength);
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
