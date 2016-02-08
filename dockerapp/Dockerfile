FROM ubuntu:15.04

MAINTAINER Riccardo Pelizzi

LABEL Description="This image pulls the current git version of websheets and runs it."


RUN apt-get update
RUN apt-get install -y npm nodejs git wget inotify-tools python-xlrd

RUN npm install -g n
RUN n 5.3.0
RUN npm install -g jade nodemon jison

RUN useradd -ms /bin/bash ws
USER ws
WORKDIR /home/ws

RUN git clone https://github.com/BruceBerry/websheets

WORKDIR websheets
RUN npm install
RUN jade -P static/
RUN jison app/wf.jison -o app/wf.js
EXPOSE 8000
CMD ["make", "publicrun"]
