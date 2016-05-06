# Goo Arena

A WebGL multiplayer FPS game.

## Set it up locally

### Server

Requires [node.js](https://www.nodejs.org/). Install & run:

```sh
npm install;
npm start;
```

By default it will serve the webpage on `http://localhost:5000` and listen for websockets on the same port: `ws://localhost:5000`. To change this, set the `PORT` and `WSS_URL` environment variables:

```sh
# Start web server on port 8888 and listen for websockets on ws://localhost:8888
PORT=8888 WSS_URL=ws://localhost:8888 npm start
```

### Development of the client

1. Duplicate [this Goo Create scene](https://create.goocreate.com/edit/e53ee6df73fd4a6eaf98558e4dbb3c9c.scene) and open it.
2. Export the scene as Webpage: *Scene > Export > Webpage*.
3. Extract the downloaded `zip` file into `public/`.
4. Restart the server.