/** Portrait iPhone / iPad launch-image sizes: [pixel width, pixel height, pixel ratio]. Used by scripts/generate-splash.ts and the layout metadata. */
export const SPLASH_SIZES: [number, number, number][] = [
  [1320, 2868, 3], [1206, 2622, 3], [1290, 2796, 3], [1179, 2556, 3], [1284, 2778, 3], [1170, 2532, 3], [1125, 2436, 3], [1242, 2688, 3],
  [828, 1792, 2], [1242, 2208, 3], [750, 1334, 2], [640, 1136, 2],
  [2048, 2732, 2], [1668, 2388, 2], [1668, 2224, 2], [1640, 2360, 2], [1620, 2160, 2], [1488, 2266, 2], [1536, 2048, 2],
];

export const splashUrl = (w: number, h: number) => `/splash/${w}x${h}.png`;
export const splashMedia = (w: number, h: number, r: number) => `(device-width: ${w / r}px) and (device-height: ${h / r}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`;
