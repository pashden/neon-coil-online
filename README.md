# Neon Coil Online

Multiplayer browser snake arena with bots, a smoothly shrinking safe zone, cosmetic colors and touch controls.

## Run

Requires Node.js 22 or 24. No third-party runtime dependencies.

```sh
npm start
```

The default local URL is http://localhost:8767/. PORT overrides the listening port.

## Render Free

- Runtime: Node
- Region: Frankfurt
- Instance: Free
- Build command: npm run build
- Start command: npm start
- Health check: /healthz
- NODE_VERSION: 22

Render supplies PORT and RENDER_EXTERNAL_URL. All players can open the same HTTPS root URL; no LAN IP addresses or room key are required.

Free instances can sleep after inactivity and restart. Live rounds are held in memory and restart with the server. Personal records are saved locally in each player's browser.

Networking sends nearby food changes, omits distant snake bodies, compresses streaming updates and avoids redundant input requests. Capacity depends on server resources and traffic limits.

## Checks

```sh
npm run build
npm test
```
