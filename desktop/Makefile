# Weight desktop app. Requires V (https://vlang.io); see README.md for the
# system packages each platform needs.
V ?= v
BIN ?= weight
PREFIX ?= $(HOME)/.local

.PHONY: build dev run test fmt check install uninstall clean

build:
	$(V) -prod -o $(BIN) .

dev:
	$(V) -g -o $(BIN) .

run:
	$(V) run . $(ARGS)

test:
	$(V) test core

fmt:
	$(V) fmt -w .

# Type-checks and generates C for each target without needing its SDK.
check:
	@mkdir -p .check
	$(V) -o .check/linux.c -os linux .
	$(V) -o .check/windows.c -os windows .
	$(V) -o .check/macos.c -os macos .
	@rm -rf .check

install: build
	install -Dm755 $(BIN) $(PREFIX)/bin/$(BIN)
	install -Dm644 ../src/web/images/weight.svg $(PREFIX)/share/icons/hicolor/scalable/apps/weight.svg
	install -Dm644 weight.desktop $(PREFIX)/share/applications/weight.desktop

uninstall:
	rm -f $(PREFIX)/bin/$(BIN) $(PREFIX)/share/icons/hicolor/scalable/apps/weight.svg \
		$(PREFIX)/share/applications/weight.desktop

clean:
	rm -rf $(BIN) $(BIN).exe .check
