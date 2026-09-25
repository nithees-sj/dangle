#!/usr/bin/env fish
# Disable and enable Dangle 20 times. Run it in a terminal *inside* the nested
# shell (make nested), then check the terminal running `make nested` for errors.

set -l uuid dangle@nithees

for i in (seq 20)
    gnome-extensions disable $uuid
    sleep 0.4
    gnome-extensions enable $uuid
    sleep 0.4
    printf 'cycle %d/20\r' $i
end
echo

gnome-extensions info $uuid | string match -r 'Enabled:.*|State:.*'
echo 'Now look at the `make nested` terminal: there should be no JS ERROR lines.'
