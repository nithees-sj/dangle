// Import page: bring your own charms (PNG, JPG or SVG), and manage them.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {replaceCharmEverywhere} from '../settingsModel.js';
import {importCharm, deleteCharmFile} from './importer.js';
import {charmPicture} from './widgets.js';

function imageFilter() {
    const filter = new Gtk.FileFilter({name: 'Images (PNG, JPG, SVG)'});
    for (const type of ['image/png', 'image/jpeg', 'image/svg+xml'])
        filter.add_mime_type(type);
    for (const suffix of ['png', 'jpg', 'jpeg', 'svg'])
        filter.add_suffix(suffix);
    return filter;
}

function toast(page, title) {
    const root = page.get_root();
    if (root?.add_toast)
        root.add_toast(new Adw.Toast({title, timeout: 3}));
}

export function importPage(model) {
    const page = new Adw.PreferencesPage({title: 'Import', icon_name: 'document-open-symbolic', name: 'import'});

    const importGroup = new Adw.PreferencesGroup({
        title: 'Import a charm',
        description: 'PNG, JPG or SVG. Pictures are fitted into 256 × 256 pixels and saved as PNG ' +
            'in ~/.local/share/dangle/charms. Transparent backgrounds look best.',
    });
    const chooseRow = new Adw.ButtonRow({title: 'Choose Picture…', start_icon_name: 'document-open-symbolic'});
    chooseRow.connect('activated', () => {
        const filters = new Gio.ListStore({item_type: Gtk.FileFilter});
        const filter = imageFilter();
        filters.append(filter);
        const dialog = new Gtk.FileDialog({title: 'Import a Charm', filters, default_filter: filter, modal: true});
        dialog.open(page.get_root(), null, (_dialog, result) => {
            let file;
            try {
                file = dialog.open_finish(result);
            } catch {
                return; // Cancelled.
            }
            page._dangleImport(file);
        });
    });
    importGroup.add(chooseRow);
    page.add(importGroup);

    let listGroup = null;

    function render() {
        if (listGroup)
            page.remove(listGroup);
        listGroup = new Adw.PreferencesGroup({title: 'Your charms'});
        const charms = model.customCharms();
        if (charms.length === 0) {
            listGroup.add(new Adw.ActionRow({
                title: 'No imported charms yet',
                subtitle: 'Imported charms appear here and in the Library.',
            }));
        }
        for (const id of charms) {
            const row = new Adw.ActionRow({title: model.nameOf(id)});
            const picture = charmPicture(model.fileFor(id), 40);
            picture.valign = Gtk.Align.CENTER;
            row.add_prefix(picture);
            const remove = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                tooltip_text: 'Delete this charm',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
            });
            remove.connect('clicked', () => page._dangleDelete(id));
            row.add_suffix(remove);
            row._dangleCharm = id;
            listGroup.add(row);
        }
        page.add(listGroup);
    }

    /** Imports a file (also the entry point for automated checks). */
    page._dangleImport = file => {
        try {
            const id = importCharm(file);
            model.notifyCharmsChanged();
            toast(page, `Imported “${model.nameOf(id)}”. Find it in the Library.`);
            return id;
        } catch (e) {
            toast(page, e.message);
            return null;
        }
    };

    page._dangleDelete = id => {
        try {
            // Cords using it fall back to the default charm first, so the
            // overlay never points at a missing file.
            replaceCharmEverywhere(model.settings, id);
            deleteCharmFile(id);
            model.notifyCharmsChanged();
            toast(page, `Deleted “${model.nameOf(id)}”.`);
        } catch (e) {
            toast(page, `Could not delete: ${e.message}`);
        }
    };

    model.onCharmsChanged(render);
    render();
    return page;
}
