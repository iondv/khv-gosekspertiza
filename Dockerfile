FROM docker.iondv.ru/kube/docker/bower:ubuntugostssl
#RUN npm install -g bower gulp mocha pm2 bower-nexus3-resolver
ADD ./platform /var/www
ARG ionpassword
ARG userpassword 
ARG CI_PROJECT_NAME
ARG CI_COMMIT_REF_SLUG
RUN cd /var/www && \
    #echo "{\"allow_root\": true,\"registry\" : {\"search\" : [ \"https://nexus.iondv.ru/repository/bower-all/\" ]},\"resolvers\" : [ \"bower-nexus3-resolver\" ]}" > ~/.bowerrc && \
    npm install && \
    export NODE_PATH=`pwd` && \
    gulp build
RUN bash /var/www/compile.sh 
ENV NODE_PATH "/var/www"
ENV CI_COMMIT_REF_SLUG $CI_COMMIT_REF_SLUG
EXPOSE 8888
