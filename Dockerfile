FROM node:18-alpine
USER root
WORKDIR /root/app

ENV DEBIAN_FRONTEND noninteractive

COPY package.json .
RUN npm install

COPY nodemon.json .
COPY /server /server