watch:
	nodemon index.js &
	while true; do \
    inotifywait -e modify static/*.jade && \
    jade -P static/; \
  done

clean:
	rm -rf wf.js static/index.html static/base.html

api:
	node --es_staging --harmony_destructuring api.js
