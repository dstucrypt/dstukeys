all: build

SRC=ui/ui.js \
	ui/entry.js \
	ui/certview.js \
	ui/keyholder.js \
	ui/document.js \
	ui/dstu.js \
	ui/identity.js \
	ui/cert.js \
	ui/stored.js \
	ui/password.js \
	ui/dnd_ui.js \
	ui/locale.js ui/l10n.js ui/langs.js

NODE_PACKAGES = asn1.js jsqrcode qrcode-js cookies-js jkurwa

NPM=$(patsubst %,node_modules/%/package.json,$(NODE_PACKAGES))

build: js/build.js js/build_dstu.js

node_modules/%/package.json:
	npm install $*

node_modules/jkurwa/package.json:
	npm install https://github.com/muromec/jkurwa/tarball/master


js/build.js: $(SRC) $(NPM)
	browserify \
		-r jkurwa \
		-r ./ui/entry.js:ui \
		-r ./ui/certview.js:certui \
		-r asn1.js \
		-r buffer \
		-r cookies-js \
		-o $@

js/build_dstu.js: ./ui/dstu_worker.js $(SRC)
	browserify \
		-r ./ui/dstu.js:dstu \
		-o $@
	cat ./js/uadstu.js >> $@
	cat ./ui/dstu_worker.js >> $@
