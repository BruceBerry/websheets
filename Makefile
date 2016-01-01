all:
	jison app/wf.jison -o app/wf.js
	jade -P static/index.jade

watch:
	nodemon -- --harmony_destructuring --harmony_default_parameters server.js &
	while true; do \
    inotifywait -e modify static/*.jade && \
    jade -P static/; \
  done

debug:
	node -- debug --harmony_destructuring --harmony_default_parameters server.js

clean:
	rm -rf wf.js static/index.html static/base.html

api:
	node --es_staging --harmony_destructuring api.js

.PHONY: watch api clean debug