// About page: version, credits and the NOTICE file.

import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

function readNotice(extension) {
    try {
        const [, bytes] = GLib.file_get_contents(extension.dir.get_child('NOTICE.md').get_path());
        return new TextDecoder().decode(bytes);
    } catch {
        return 'NOTICE.md is missing from this installation.';
    }
}

export function aboutPage(extension) {
    const page = new Adw.PreferencesPage({title: 'About', icon_name: 'help-about-symbolic', name: 'about'});

    const info = new Adw.PreferencesGroup({title: extension.metadata.name, description: extension.metadata.description});
    info.add(new Adw.ActionRow({
        title: 'Version',
        subtitle: extension.metadata['version-name'] ?? String(extension.metadata.version ?? ''),
        subtitle_selectable: true,
    }));
    info.add(new Adw.ActionRow({
        title: 'Credits',
        subtitle: 'Charms and icons drawn for Dangle. The rope physics ports ideas and values ' +
            'from an MIT-licensed project; details below.',
    }));
    page.add(info);

    const notice = new Adw.PreferencesGroup({title: 'Notices'});
    const view = new Gtk.TextView({
        editable: false,
        cursor_visible: false,
        monospace: true,
        wrap_mode: Gtk.WrapMode.WORD_CHAR,
        top_margin: 12,
        bottom_margin: 12,
        left_margin: 12,
        right_margin: 12,
    });
    view.buffer.text = readNotice(extension);
    const scroller = new Gtk.ScrolledWindow({
        child: view,
        min_content_height: 320,
        css_classes: ['card'],
    });
    notice.add(scroller);
    page.add(notice);
    return page;
}
