all:
	jison app/wf.jison -o app/wf.js
	jade -P static/index.jade

watch:
	nodemon server.js &
	while true; do \
    inotifywait -e modify static/*.jade && \
    jade -P static/; \
  done

clean:
	rm -rf wf.js static/index.html static/base.html

api:
	node --es_staging --harmony_destructuring api.js

.PHONY: watch api clean