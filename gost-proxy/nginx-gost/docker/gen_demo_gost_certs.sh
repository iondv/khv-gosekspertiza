#/bin/sh

mkdir -p /etc/nginx/certs
# Generate new CA cert and key
openssl req -x509 -newkey gost2012_512 -pkeyopt paramset:A -nodes -days 10000 -keyout /etc/certs/ca_key.pem -out /etc/nginx/certs/ca_cert.crt -subj "/C=RU/L=Khabarovsk/O=TEST GOST/CN=GOST 2012 CA"

# Generate new key for site
openssl genpkey -algorithm gost2012_512 -pkeyopt paramset:A -out /etc/nginx/certs/expkhv.ru.key

# Generate new request for site
openssl req -new -key /etc/nginx/certs/expkhv.ru.key -out /etc/nginx/certs/expkhv.ru.csr -subj "/C=RU/L=Khabarovsk/O=Expkhv with GOST/CN=expkhv.ru"

# Sign request with CA
openssl x509 -req -in /etc/nginx/certs/expkhv.ru.csr -CA /etc/nginx/certs/ca_cert.crt -CAkey /etc/nginx/certs/ca_key.pem -CAcreateserial -out /etc/nginx/certs/expkhv.ru.crt -days 5000
