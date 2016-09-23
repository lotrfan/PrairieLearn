FROM postgres:9.5

RUN useradd pl

RUN set -xe \
	&& apt-get update \
	&& apt-get install -y curl jq \
    && curl -qLl https://deb.nodesource.com/setup_4.x | bash - \
	&& apt-get update \
	&& apt-get install -y nodejs daemontools \
	&& rm -rf /var/lib/apt/lists/*

COPY v2 /pl
RUN  cd /pl && npm install && chown -R pl /pl && mv /pl/exampleCourse /course

EXPOSE 3000

ENTRYPOINT []
CMD ["/start.sh"]

COPY docker/config.json docker/start.sh /
COPY docker/service /etc/service
