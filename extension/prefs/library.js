// Library page: every charm (built-in and imported) in a grid. Pick a cord and
// a slot, then click a charm to hang it there; drag charms onto slots, or
// drag slots onto each other to reorder a cord's charms.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {MAX_CHARMS} from '../core/charmLayout.js';
import {assignCharm, moveCharm, setCharmCount} from '../core/cords.js';
import {charmPicture, charmTile, clearChildren, setComboChoices} from './widgets.js';

const SLOT_NAMES = ['Top', 'Middle', 'Bottom'];

function slotLabel(index, count) {
    if (count === 1)
        return 'Charm';
    if (count === 2)
        return index === 0 ? 'Top' : 'Bottom';
    return SLOT_NAMES[index];
}

/** Drag payloads are strings: "slot:<index>" or "charm:<id>". */
function dragSource(payload) {
    const source = new Gtk.DragSource({actions: Gdk.DragAction.COPY | Gdk.DragAction.MOVE});
    source.connect('prepare', () => Gdk.ContentProvider.new_for_value(payload));
    return source;
}

export function libraryPage(model) {
    const page = new Adw.PreferencesPage({title: 'Library', icon_name: 'view-grid-symbolic', name: 'library'});
    const guard = {updating: false};
    let selectedSlot = 0;

    // ── the cord being edited ──────────────────────────────────────────────
    const cordGroup = new Adw.PreferencesGroup({
        title: 'Cord',
        description: 'Choose a slot, then click a charm below to hang it there. Drag slots to reorder them.',
    });
    const cordRow = new Adw.ComboRow({title: 'Editing'});
    cordRow.connect('notify::selected', () => {
        if (guard.updating)
            return;
        model.activeCord = cordRow.selected;
        selectedSlot = 0;
        renderSlots();
    });
    cordGroup.add(cordRow);

    const slotBox = new Gtk.Box({
        spacing: 12,
        halign: Gtk.Align.CENTER,
        margin_top: 12,
        margin_bottom: 12,
        margin_start: 12,
        margin_end: 12,
    });
    cordGroup.add(new Adw.PreferencesRow({activatable: false, child: slotBox}));
    page.add(cordGroup);

    // ── the charm grid ─────────────────────────────────────────────────────
    const charmGroup = new Adw.PreferencesGroup({title: 'Charms'});
    const flow = new Gtk.FlowBox({
        selection_mode: Gtk.SelectionMode.NONE,
        homogeneous: true,
        min_children_per_line: 3,
        max_children_per_line: 6,
        row_spacing: 6,
        column_spacing: 6,
        margin_top: 6,
        margin_bottom: 6,
    });
    charmGroup.add(flow);
    page.add(charmGroup);

    const cord = () => model.cords[model.activeCord];

    function assign(id) {
        model.edit(cords => assignCharm(cords, model.activeCord, selectedSlot, id));
        renderCords();
    }

    function renderCords() {
        const cords = model.cords;
        const labels = cords.map((c, i) => `Cord ${i + 1} · ${c[3].map(id => model.nameOf(id)).join(' + ')}`);
        setComboChoices(cordRow, labels, model.activeCord, guard);
        renderSlots();
    }

    function renderSlots() {
        clearChildren(slotBox);
        const current = cord();
        if (!current)
            return;
        const charms = current[3];
        selectedSlot = Math.min(selectedSlot, charms.length - 1);

        charms.forEach((id, i) => {
            const content = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 4});
            content.append(charmPicture(model.fileFor(id), 72));
            content.append(new Gtk.Label({label: slotLabel(i, charms.length), css_classes: ['dangle-caption']}));
            const button = new Gtk.Button({
                child: content,
                css_classes: ['flat', 'dangle-slot', ...(i === selectedSlot ? ['selected'] : [])],
                tooltip_text: `${model.nameOf(id)} — click to select, drag to reorder`,
            });
            button.connect('clicked', () => {
                selectedSlot = i;
                renderSlots();
            });
            button.add_controller(dragSource(`slot:${i}`));

            const drop = Gtk.DropTarget.new(GObject.TYPE_STRING, Gdk.DragAction.COPY | Gdk.DragAction.MOVE);
            drop.connect('enter', () => {
                button.add_css_class('drop-target');
                return Gdk.DragAction.MOVE;
            });
            drop.connect('leave', () => button.remove_css_class('drop-target'));
            drop.connect('drop', (_target, value) => {
                button.remove_css_class('drop-target');
                const [kind, rest] = [value.slice(0, value.indexOf(':')), value.slice(value.indexOf(':') + 1)];
                if (kind === 'slot') {
                    model.edit(cords => moveCharm(cords, model.activeCord, Number(rest), i));
                } else if (kind === 'charm') {
                    selectedSlot = i;
                    model.edit(cords => assignCharm(cords, model.activeCord, i, rest));
                } else {
                    return false;
                }
                selectedSlot = i;
                renderCords();
                return true;
            });
            button.add_controller(drop);

            const column = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 4});
            column.append(button);
            if (charms.length > 1) {
                const remove = new Gtk.Button({
                    icon_name: 'list-remove-symbolic',
                    tooltip_text: 'Remove this charm',
                    css_classes: ['flat', 'circular'],
                    halign: Gtk.Align.CENTER,
                });
                remove.connect('clicked', () => {
                    model.edit(cords => {
                        cords[model.activeCord][3].splice(i, 1);
                        return cords;
                    });
                    renderCords();
                });
                column.append(remove);
            }
            slotBox.append(column);
        });

        if (charms.length < MAX_CHARMS) {
            const add = new Gtk.Button({
                icon_name: 'list-add-symbolic',
                tooltip_text: 'Add a charm to this cord',
                css_classes: ['flat', 'circular'],
                valign: Gtk.Align.CENTER,
            });
            add.connect('clicked', () => {
                selectedSlot = charms.length;
                model.edit(cords => setCharmCount(cords, model.activeCord, charms.length + 1));
                renderCords();
            });
            slotBox.append(add);
        }
    }

    function renderLibrary() {
        clearChildren(flow);
        for (const id of model.allCharms()) {
            const button = new Gtk.Button({
                child: charmTile(model.fileFor(id), model.nameOf(id), 56),
                css_classes: ['flat', 'dangle-tile'],
                tooltip_text: `Hang ${model.nameOf(id)} in the selected slot`,
            });
            button.connect('clicked', () => assign(id));
            button.add_controller(dragSource(`charm:${id}`));
            button._dangleCharm = id;
            flow.append(button);
        }
    }

    model.onChange((key, own) => {
        if (!own && (key === 'cords' || key === 'active-cord'))
            renderCords();
    });
    model.onCharmsChanged(() => {
        renderLibrary();
        renderCords();
    });

    renderCords();
    renderLibrary();
    page._dangle = {
        flow, slotBox, cordRow, select: i => {
            selectedSlot = i;
            renderSlots();
        },
    };
    return page;
}
