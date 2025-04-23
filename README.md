# race-game
simple multiplayer racing game with websockets for my web class

## Additionaly installed software on server
- composer
- node
- npm
- supervisor

## Websocket Server location
~/gejmServer/index.js
### Setup with nginx
We need to set up nginx to proxy the websocket connection. 
The following configuration should be added to your nginx 
config file (usually located at `/etc/nginx/sites-available/{your_domain}`.

Add this to config
```
location /game {
                proxy_http_version 1.1;
                proxy_set_header Upgrade $http_upgrade;
                proxy_set_header Connection "upgrade";
                proxy_pass http://localhost:8080;
               }

```

```nginx

Pri zmene konfiguracie supervisora
```shell
sudo supervisorccrl reread
```
```shell
sudo supervisorctl update
```
