#!/bin/bash

imageName="gost-proxy"
dockerName="lk.egrz.local"

if docker ps | grep $dockerName ; then
  docker stop $dockerName
fi
if docker ps -a | grep $dockerName ; then
  docker rm $dockerName
fi

docker rmi $imageName:latest

cd ./docker
  docker build -t $imageName .
cd ..

docker run -d --expose 80 --network=iondv-net --name $dockerName $imageName

echo "check GOST inside docker image"
docker run -it --rm $imageName bash -c "openssl ciphers | grep 'GOST2012-GOST8912-GOST8912' && echo -en '\nOK\n' || echo -en '\nFAIL\n'"
echo "check curl inside docker image for https://lk.egrz.ru"
docker run -it --rm $imageName bash -c "curl https://lk.egrz.ru -k | head && echo -en '\nOK\n' || echo -en '\nFAIL\n'"

#docker run -it --rm $imageName bash -c "openssl s_client -connect lk.egrz.ru:443 -showcerts"
#docker run -it --rm $imageName bash -c "openssl s_client -connect api.dom.gosuslugi.ru:443 -showcerts"


#echo "https://lk.egrz.ru/ for compare with rnix/openssl-gost docker"
#docker run -it --rm rnix/openssl-gost curl "https://lk.egrz.ru" -k | head && echo -en "\nOK\n" || echo -en "\nFAIL\n"

dockerIP=`docker inspect $dockerName | grep -oP '"IPAddress":\s"\d+\.\d+\.\d+\.\d+' | grep -oP '\d+\.\d+\.\d+\.\d+'`

echo "check  docker proxy http://$dockerName on $dockerIP"
curl http://$dockerIP -k | head && echo -en "\nOK\n" || echo -en "\nFAIL\n"

