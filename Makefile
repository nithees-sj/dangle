# Dangle — build, test and install helpers.
# Recipes run under /bin/sh, so they work the same when invoked from fish.

UUID       := dangle@nithees
SCHEMA     := org.gnome.shell.extensions.dangle.gschema.xml
SRC        := extension
DEST       := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
DIST       := dist
NESTED_RES ?= 1920x1080

.PHONY: all test lint sync schemas install uninstall nested pack logs clean

all: test lint

test:
	node --test tests/

lint: node_modules
	npx eslint .

node_modules: package.json
	npm install --no-audit --no-fund
	@touch node_modules

# Make the extension self-contained: it imports ./core/*.js
sync:
	rm -rf $(SRC)/core
	cp -r core $(SRC)/core

schemas:
	glib-compile-schemas --strict $(SRC)/schemas

install: sync schemas
	mkdir -p $(DEST)
	rsync -a --delete $(SRC)/ $(DEST)/
	@echo "Installed to $(DEST)"
	@echo "Wayland cannot hot-load a new extension: test it with 'make nested',"
	@echo "or log out and back in, then: gnome-extensions enable $(UUID)"

uninstall:
	-gnome-extensions disable $(UUID)
	rm -rf $(DEST)
	@echo "Removed $(DEST)"

# GNOME 49+ nested session (needs the mutter devkit viewer)
nested:
	@pacman -Qq mutter-devkit >/dev/null 2>&1 || { \
		echo "The nested shell needs the Mutter devkit. Install it with:"; \
		echo "    sudo pacman -S mutter-devkit"; \
		exit 1; }
	env MUTTER_DEBUG_DUMMY_MODE_SPECS=$(NESTED_RES) \
		dbus-run-session gnome-shell --devkit --wayland

pack: sync
	mkdir -p $(DIST)
	gnome-extensions pack $(SRC) \
		--force \
		--out-dir=$(DIST) \
		--schema=schemas/$(SCHEMA) \
		$(foreach f,$(filter-out extension.js prefs.js metadata.json stylesheet.css schemas,$(notdir $(wildcard $(SRC)/*))),--extra-source=$(f))
	@ls -l $(DIST)/$(UUID).shell-extension.zip

logs:
	journalctl -f -o cat /usr/bin/gnome-shell

clean:
	rm -rf $(SRC)/core $(SRC)/schemas/gschemas.compiled $(DIST)
