FROM node:8.9.1

RUN apt-get update \
 && apt-get -y install libgd2-dev \
 && rm -rf /var/lib/apt/lists/*

ARG uid=1000
RUN mkdir -p /app/src \
 && chown -R ${uid}:${uid} /app


RUN chown -R ${uid} /app/src

ARG env=dev
COPY package.json package-lock.json ./
RUN if [ ${env} = production ] ; then \
      npm install ; \
    fi

COPY . /app/src
WORKDIR /app/src

USER ${uid}:${uid}

ENTRYPOINT ["/app/src/docker-entrypoint.sh"]
CMD ["run"]
