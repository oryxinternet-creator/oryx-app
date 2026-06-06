import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // base relativa: necessário para o Capacitor servir os assets do APK localmente
  base: "./",
  build: {
    outDir: "dist",
  },
});
