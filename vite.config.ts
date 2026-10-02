import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "drm-proxy",
      configureServer(server) {
        const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
        server.middlewares.use("/api/emails", async (req, res) => {
          const { handleEmails } = await import("./server/emails.mjs");
          await handleEmails(req, res, env);
        });
        server.middlewares.use("/api/drm", async (req, res) => {
          // Middleware strips its mount path; query parameters remain intact.
          const { handleDrm } = await import("./server/drm.mjs");
          await handleDrm(req, res, env);
        });
      },
    },
  ],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: { "@": fileURLToPath(new URL("./src/shared", import.meta.url)) },
  },
  build: { sourcemap: false },
}));
