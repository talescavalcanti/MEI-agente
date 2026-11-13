import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Fixa a raiz do workspace neste projeto (evita confusão com lockfiles do home).
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
