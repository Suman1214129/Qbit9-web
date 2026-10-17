# QBIT9 customer web

```
npm install
cp .env.example .env.local
npm run dev        # http://localhost:3000
npm test && npm run typecheck && npm run lint
```
Runs fully on a mock backend (localStorage). A dev panel (bottom-left) can skip to 3 away, call you, start and finish service, and override location. Docs are in `docs/`; AI context is in `AGENT.md` and `.agent/skills/qbit9`.
