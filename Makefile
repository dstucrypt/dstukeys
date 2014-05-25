all: build

SRC=ui/ui.js ui/entry.js ui/keyholder.js ui/document.js ui/dstu.js ui/identity.js ui/certview.js ui/cert.js
NPM=node_modules/asn1.js/package.json node_modules/jkurwa/package.json
build: js/build.js

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
		-o $@
