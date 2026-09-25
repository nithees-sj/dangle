// Development only: a plain GTK window the test driver puts under the charms.
// Counts primary clicks it receives into <out>/clicks-<mode>.txt.
//
//   gjs -m client.js <maximize|fullscreen> <out dir>

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';

const [mode, outDir] = ARGV;
const counter = GLib.build_filenamev([outDir, `clicks-${mode}.txt`]);
let clicks = 0;
GLib.file_set_contents(counter, '0');

const app = new Gtk.Application({application_id: `org.dangle.TestClient.${mode}`, flags: Gio.ApplicationFlags.NON_UNIQUE});
app.connect('activate', () => {
    const window = new Gtk.ApplicationWindow({application: app, title: `dangle-client-${mode}`});
    window.set_child(new Gtk.Label({label: 'Dangle click-through test window'}));
    const click = new Gtk.GestureClick({button: 1});
    click.connect('pressed', () => {
        clicks++;
        GLib.file_set_contents(counter, String(clicks));
    });
    window.add_controller(click);
    if (mode === 'fullscreen')
        window.fullscreen();
    else
        window.maximize();
    window.present();
});
await app.runAsync([]);
