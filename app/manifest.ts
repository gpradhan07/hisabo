import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "hisabo",
    short_name: "hisabo",
    description: "Har rupaye ka hisaab. Your personal expense and EMI dashboard.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1110",
    theme_color: "#0b1110",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
