import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El engine corre en API routes (Node.js) — no en el cliente
  serverExternalPackages: ['playwright', 'ffmpeg-static'],

  // Aumentar límite para uploads de HTML grandes
};

export default nextConfig;
