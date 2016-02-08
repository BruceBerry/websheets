all:
	jison app/wf.jison -o app/wf.js
	jade -P static/index.jade

es6flags = --harmony_destructuring --harmony_default_parameters --harmony_spreadcalls --harmony_rest_parameters

watch:
	nodemon -- $(es6flags) server.js &
	while true; do \
    inotifywait -e modify static/*.jade && \
    jade -P static/; \
  done

docker:
	cd dockerapp; sudo docker build --build-arg CACHE_DATE="$(date)" .

# it will run with the default password, add --defaultPass=XXX in your container
publicrun:
	jade -P static/
	jison app/wf.jison -o app/wf.js
	nodemon -- $(es6flags) server.js --address=0.0.0.0 --admin=false

debug:
	node -- debug $(es6flags) server.js

bdebug:
	echo "Open node-inspector first"
	node --debug-brk $(es6flags) server.js


clean:
	rm -rf wf.js static/index.html static/base.html

api:
	node $(es6flags) api.js

todo:
	grep "TODO" *.js app/*.js

lint:
	jshint *.js; cd app; jshint *.js; cd ../static; jshint *.js

.PHONY: watch publicrun api todo clean debug bdebug lint