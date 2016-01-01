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

debug:
	node -- debug $(es6flags) server.js

clean:
	rm -rf wf.js static/index.html static/base.html

api:
	node $(es6flags) api.js

.PHONY: watch api clean debug