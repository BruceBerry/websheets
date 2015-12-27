watch:
	nodemon index.js &
	while true; do \
    inotifywait -e modify static/*.jade && \
    jade -P static/; \
  done
