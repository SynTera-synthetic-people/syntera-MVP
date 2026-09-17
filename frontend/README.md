# Synthetic People — Frontend

React 19 + Vite single-page app for the Synthetic People platform.

**Setup, environment variables and deployment are documented in the
[root README](../README.md).**

## Quick reference

```bash
npm install
cp example.env .env.local      # use .env.local, not .env
npm run dev                    # http://localhost:5173
```

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run test:questionnaire` | Questionnaire codec tests |

`frontend/.env` is committed and baked into the Docker image, so keep it
pointing at the deployed API. Local overrides go in `.env.local`, which is
gitignored.

## Source layout

| Path | Contents |
|---|---|
| `src/components/pages/` | Screens, grouped by feature |
| `src/hooks/` | TanStack Query hooks |
| `src/services/` | API clients |
| `src/redux/` | Store, slices and sagas |
| `src/routes/` | Route definitions and guards |
| `src/config/apiConfig.js` | Reads the `VITE_*` variables |
