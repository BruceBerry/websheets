FROM ubuntu:15.04

MAINTAINER Riccardo Pelizzi

LABEL Description="This image pulls the current git version of websheets and runs it."


RUN apt-get update
RUN apt-get install -y npm nodejs git wget inotify-tools python-xlrd
RUN apt-get install -y nano

RUN npm install -g n
RUN n 5.3.0
RUN npm install -g jade nodemon jison

RUN useradd -ms /bin/bash ws
USER ws
WORKDIR /home/ws

ARG CACHE_DATE="Mon Feb  8 11:29:00 EST 2016"
RUN git clone https://github.com/BruceBerry/websheets

WORKDIR websheets
RUN npm install
RUN jade -P static/
RUN jison app/wf.jison -o app/wf.js
EXPOSE 8000
CMD ["make", "publicrun"]
