// Cords page: the preset, and each cord's position, length, charm count and
// rope style.

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {PRESET_IDS, presetName} from '../core/presets.js';
import {STYLES, styleName} from '../core/ropeStyles.js';
import {MAX_CORDS, MIN_LENGTH, MAX_LENGTH, MIN_POSITION, MAX_POSITION, addCord, removeCord, setCharmCount} from '../core/cords.js';
import {MAX_CHARMS} from '../core/charmLayout.js';
import {applyPreset} from '../settingsModel.js';

function spinRow(title, subtitle, lower, upper, step, value) {
    return new Adw.SpinRow({
        title,
        subtitle,
        digits: 0,
        adjustment: new Gtk.Adjustment({lower, upper, step_increment: step, page_increment: step * 5, value}),
    });
}

export function cordsPage(model) {
    const page = new Adw.PreferencesPage({title: 'Cords', icon_name: 'view-list-symbolic', name: 'cords'});
    const guard = {updating: false};

    // ── preset ─────────────────────────────────────────────────────────────
    const presetGroup = new Adw.PreferencesGroup({title: 'Preset'});
    const presetRow = new Adw.ComboRow({
        title: 'Layout',
        subtitle: 'Editing any cord switches to Custom',
        model: Gtk.StringList.new(PRESET_IDS.map(presetName)),
    });
    presetRow.connect('notify::selected', () => {
        if (!guard.updating)
            applyPreset(model.settings, PRESET_IDS[presetRow.selected]);
    });
    presetGroup.add(presetRow);
    page.add(presetGroup);

    // Only the selection is synced: rebuilding a combo row's model from inside
    // its own change handler crashes libadwaita.
    const syncPreset = () => {
        const index = Math.max(0, PRESET_IDS.indexOf(model.settings.get_string('preset')));
        if (presetRow.selected === index)
            return;
        guard.updating = true;
        presetRow.selected = index;
        guard.updating = false;
    };

    // ── cords ──────────────────────────────────────────────────────────────
    let group = null;
    const expanded = new Set([0]);

    const addButton = new Gtk.Button({icon_name: 'list-add-symbolic', tooltip_text: 'Add a cord', css_classes: ['flat']});
    const removeButton = new Gtk.Button({icon_name: 'list-remove-symbolic', tooltip_text: 'Remove the last cord', css_classes: ['flat']});
    addButton.connect('clicked', () => {
        model.edit(addCord);
        expanded.add(model.cords.length - 1);
        render();
    });
    removeButton.connect('clicked', () => {
        model.edit(removeCord);
        render();
    });
    const suffix = new Gtk.Box({spacing: 6});
    suffix.append(removeButton);
    suffix.append(addButton);

    const subtitleFor = c => `${styleName(c[2])} · ${c[3].map(id => model.nameOf(id)).join(' + ')}`;

    function edit(index, change) {
        model.edit(cords => {
            change(cords[index]);
            return cords;
        });
    }

    function render() {
        if (group) {
            group.set_header_suffix(null);
            page.remove(group);
        }
        const cords = model.cords;
        group = new Adw.PreferencesGroup({
            title: 'Cords',
            description: `Up to ${MAX_CORDS} cords hang along the bottom of the top bar.`,
        });
        group.set_header_suffix(suffix);
        addButton.sensitive = cords.length < MAX_CORDS;
        removeButton.sensitive = cords.length > 1;

        cords.forEach((cord, i) => {
            const row = new Adw.ExpanderRow({
                title: `Cord ${i + 1}`,
                subtitle: subtitleFor(cord),
                expanded: expanded.has(i),
            });
            row.connect('notify::expanded', () => (row.expanded ? expanded.add(i) : expanded.delete(i)));

            const position = spinRow('Position', 'Percent across the top bar',
                                     MIN_POSITION * 100, MAX_POSITION * 100, 1, Math.round(cord[0] * 100));
            position.connect('notify::value', () => edit(i, c => (c[0] = position.value / 100)));

            const length = spinRow('Length', 'Rope length in pixels', MIN_LENGTH, MAX_LENGTH, 5, Math.round(cord[1]));
            length.connect('notify::value', () => edit(i, c => (c[1] = length.value)));

            const count = spinRow('Charms', 'Charms hanging on this cord', 1, MAX_CHARMS, 1, cord[3].length);
            count.connect('notify::value', () => {
                model.edit(cords => setCharmCount(cords, i, count.value));
                row.subtitle = subtitleFor(model.cords[i]);
            });

            const style = new Adw.ComboRow({
                title: 'Rope style',
                model: Gtk.StringList.new(STYLES.map(s => s.name)),
                selected: Math.max(0, STYLES.findIndex(s => s.id === cord[2])),
            });
            style.connect('notify::selected', () => {
                edit(i, c => (c[2] = STYLES[style.selected].id));
                row.subtitle = subtitleFor(model.cords[i]);
            });

            row.add_row(position);
            row.add_row(length);
            row.add_row(count);
            row.add_row(style);
            group.add(row);
        });
        page.add(group);
    }

    model.onChange((key, own) => {
        if (key === 'preset')
            syncPreset();
        if (key === 'cords' && !own)
            render();
    });

    syncPreset();
    render();
    return page;
}
