FROM ubuntu

MAINTAINER Riccardo Pelizzi

RUN apt-get update
RUN apt-get install -y npm
RUN apt-get install -y nodejs

RUN npm install -g underscore request express jade shelljs http sys jquery lodash async validator co when wrench brain    forever debug && export NODE_PATH=/usr/local/lib/node_modules/
