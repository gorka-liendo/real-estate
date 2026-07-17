// Nombres de ruta centralizados — nunca strings literales en <Link>/router.push.
export const routes = {
  login: "/login",
  home: "/",
  microsite: "/microsite",
  admin: "/admin",
} as const;

// Ítems de navegación del sidebar. `module` gatea el ítem por feature flag;
// `admin` lo restringe a superadmins de plataforma.
export type NavKey = "home" | "microsite" | "admin";
