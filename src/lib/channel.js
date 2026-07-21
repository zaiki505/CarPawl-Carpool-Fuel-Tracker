/* Release channel.

   Two GitHub repos serve two audiences:
     beta    -> zaiki505/CarPawl                        (prereleases welcome)
     release -> zaiki505/CarPawl-Carpool-Fuel-Tracker   (the public app)

   The channel is fixed at BUILD time by VITE_RELEASE_CHANNEL, which the
   `build:beta` / `build:release` scripts set via Vite's --mode (.env.beta /
   .env.release). Anything that isn't exactly "release" is treated as beta, so a
   bare `vite build` or `npm run dev` can never accidentally claim to be an
   official build - the safe default is the one that under-promises. */

export const CHANNEL =
  import.meta.env.VITE_RELEASE_CHANNEL === "release" ? "release" : "beta";

export const IS_BETA = CHANNEL === "beta";

/** The repo this build checks for updates and links to in About. */
export const CHANNEL_REPO = IS_BETA
  ? "zaiki505/CarPawl"
  : "zaiki505/CarPawl-Carpool-Fuel-Tracker";

/** App name shown in the tab/title. The Android app name comes from the gradle
 *  product flavor instead (resValue app_name), not from here. */
export const APP_NAME = IS_BETA ? "CarPawl Beta" : "CarPawl";

/* Injected by vite.config.js from package.json, so the version lives in exactly
   one place on the web side instead of being hand-copied into a constant. */
export const APP_VERSION = __APP_VERSION__;
