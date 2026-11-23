import type { MetadataRoute } from "next";

/** Lets phones "Add to Home screen" with the Loveshore icon and open it like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Loveshore",
    short_name: "Loveshore",
    description: "Loveshore ladies' PG — rent, bills and notices",
    start_url: "/login",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f766e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
