# CarPawl

CarPawl is a small offline first PWA for tracking fuel costs and splitting carpool fuel bills. It runs in the browser with IndexedDB, so there is no backend and no account setup.

## Features

- Track your own fuel fill ups by cost, liters, or distance.
- Split trip costs with other passengers using assigned distance.
- See balances owed to you and balances you owe.
- Review monthly spend, fuel use, and fuel efficiency trends.
- Use the app fully offline after installation.

## Tech stack

- React 18 + Vite
- Dexie with IndexedDB
- Recharts for charts
- lucide-react for icons
- vite-plugin-pwa for PWA support
- Netlify for deployment

## Development

```bash
npm install
npm run dev
npm run build
npm run preview
npm test
```

The first run opens directly to the car setup flow.

## Data and backup

- Data is stored locally in IndexedDB under the name carpawl.
- Clearing site data removes everything, so export a backup regularly.
- Backup files can be exported and restored from Settings.
- Currency is fixed to MYR and dates are shown as DD-MM-YYYY.

## How the split works

- Each passenger is charged by the share of trip distance they were assigned.
- Distance that is not assigned to anyone is treated as your own driving and is not billed.
- Balances are shown separately for money owed to you and money you owe.

## Project structure

```text
src/
  app/
  components/
  db/
  lib/
  screens/
  styles/
zaiki-design-system/
```

## Notes

- This app is single user and does not connect to any backend.
- Google Drive backup is not implemented yet.
