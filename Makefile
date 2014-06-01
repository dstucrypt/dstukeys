all: build

SRC=ui/ui.js \
	ui/entry.js \
	ui/certview.js \
	ui/keyholder.js \
	ui/document.js \
	ui/identity.js \
	ui/cert.js \
	ui/stored.js \
	ui/password.js \
	ui/dnd_ui.js \
	ui/locale.js ui/l10n.js ui/langs.js \
	ui/dstu.js

NODE_PACKAGES = asn1.js jsqrcode qrcode-js cookies-js jkurwa em-gost

NPM=$(patsubst %,node_modules/%/package.json,$(NODE_PACKAGES))

build: js/build.js js/build_dstu.js

node_modules/%/package.json:
	npm install $*

node_modules/jkurwa/package.json:
	npm install https://github.com/muromec/jkurwa/tarball/master

node_modules/em-gost/package.json:
	npm install https://github.com/muromec/em-gost/tarball/master

js/build.js: $(SRC) $(NPM)
	browserify \
		--noparse=./node_modules/em-gost/lib/uadstu.js \
		-r em-gost \
		-r jkurwa \
		-r ./ui/entry.js:ui \
		-r ./ui/certview.js:certui \
		-r asn1.js \
		-r buffer \
		-r cookies-js \
		-o $@

js/build_dstu.js: ./ui/dstu_worker.js $(SRC)
	browserify \
		--noparse=./node_modules/em-gost/lib/uadstu.js \
		-r em-gost \
		-r ./ui/dstu.js:dstu \
		-o $@
	cat ./ui/dstu_worker.js >> $@
