all: build

SRC=ui/ui.js ui/entry.js ui/keyholder.js ui/document.js ui/dstu.js ui/identity.js ui/certview.js ui/cert.js ui/stored.js ui/locale.js ui/l10n.js ui/langs.js ui/password.js
NPM=node_modules/asn1.js/package.json node_modules/jkurwa/package.json

build: js/build.js js/build_dstu.js

node_modules/asn1.js/package.json:
	npm install asn1.js 

js/build.js: $(SRC) $(NPM)
	browserify \
		-r jkurwa \
		-r ./libs/sjcl/sjcl.js:sjcl \
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
