const UUID_PATH_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isOrdersCentralRoute(location: string) {
  if (location === "/os" || location === "/os/novo") return true;
  const segments = location.split("/").filter(Boolean);
  return segments.length === 2 && segments[0] === "os" && UUID_PATH_SEGMENT.test(segments[1]);
}

export function getOperationalNavState(location: string) {
  return {
    orders: isOrdersCentralRoute(location),
    art: location === "/os/arte" || location.startsWith("/os/arte/"),
    production: location === "/os/producao" || location.startsWith("/os/producao/"),
  };
}
