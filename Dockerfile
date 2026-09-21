FROM nginx:1.30.5-alpine

COPY . /usr/share/nginx/html

EXPOSE 80
