#!/bin/bash

dockerName="lk.egrz.local"

if ! docker network list | grep iondv-net ; then docker network create --subnet 10.201.1.0/24 iondv-net; fi 


if docker ps | grep $dockerName ; then
  docker stop $dockerName
  docker rm $dockerName
elif docker ps -a | grep $dockerName ; then
  docker rm $dockerName
fi

docker run  --name $dockerName \
            -v /iondv-goseksp/nginx-gost/etc/:/etc/nginx/ \
            -v /var/log/nginx-gost:/var/log/nginx \
            --expose 80 \
            --net iondv-net \
            --env "TZ=Asia/Vladivostok" \
            --restart unless-stopped \
            -d \
            nginx-gost:latest
