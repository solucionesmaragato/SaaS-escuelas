import defineConfig from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: true, // 👈 ¡AÑADE ESTA LÍNEA AQUÍ PARA FORZAR EL MOTOR!
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    server: {
      allowedHosts: true,
      host: true,
    },
  },
});
