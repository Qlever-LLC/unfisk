FROM node:14

COPY ./entrypoint.sh /entrypoint.sh
RUN chmod u+x /entrypoint.sh

WORKDIR /code/unfisk

CMD '/entrypoint.sh'
