FROM alpine:latest

LABEL maintainer="PRX <sysadmin@prx.org>"
LABEL org.prx.lambda="true"

WORKDIR /app

RUN apk add zip

RUN mkdir -p /.prxci

ADD src/action.js .
ADD src/writer.js .

RUN zip -rq /.prxci/build.zip .
