#!/bin/bash

dockerName="lk.egrz.local"
imageName="rnix/nginx-gost"

if docker ps | grep $dockerName ; then
  docker stop $dockerName
fi
if docker ps -a | grep $dockerName ; then
  docker rm $dockerName
fi

docker run -d -v "$(pwd)/etc/:/etc/nginx" --network=iondv-net --name $dockerName $imageName

echo "check GOST inside $imageName docker image"
docker run -it --rm $imageName bash -c "openssl ciphers | grep 'GOST2012-GOST8912-GOST8912' && echo -en '\nOK\n' || echo -en '\nFAIL\n'"
#docker run -it --rm $imageName bash -c "openssl s_client -connect lk.egrz.ru:443 -showcerts"
#docker run -it --rm $imageName bash -c "openssl s_client -connect api.dom.gosuslugi.ru:443 -showcerts"

echo "check curl inside rnix/openssl-gost docker image for https://lk.egrz.ru"
docker run -it --rm rnix/openssl-gost curl "https://lk.egrz.ru" -k | head && echo -en "\nOK\n" || echo -en "\nFAIL\n"
#docker run -it --rm rnix/openssl-gost curl https://alpha.demo.nbki.ru -k | head && echo "OK" || echo "FAIL"
#docker run -it --rm rnix/openssl-gost curl https://zakupki.gov.ru -k | head && echo "OK" || echo "FAIL"
#docker run -it --rm rnix/openssl-gost curl https://portal.rosreestr.ru:4455 -k | head && echo "OK" || echo "FAIL"
#docker run -it --rm rnix/openssl-gost curl https://api.dom.gosuslugi.ru -k | head && echo "OK" || echo "FAIL"

echo "check docker proxy http://$dockerName from outside docker"
docker run -it --rm --network=iondv-net rnix/openssl-gost curl "http://$dockerName/" -k | head && echo -en "\nOK\n" || echo -en "\nFAIL\n"

dockerIP=`docker inspect $dockerName | grep -oP '"IPAddress":\s"\d+\.\d+\.\d+\.\d+' | grep -oP '\d+\.\d+\.\d+\.\d+'`
echo "check docker proxy http://$dockerName on $dockerIP"
curl http://$dockerIP -k | head && echo -en "\nOK\n" || echo -en "\nFAIL\n"

tail $(pwd)/etc/error.log.tmp