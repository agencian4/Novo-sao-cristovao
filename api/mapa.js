// Diz à página qual mapa do Google mostrar na seção de localização.
// Com GOOGLE_MAPS_EMBED_KEY configurada na Vercel: rota da VI GERES até o acesso (Maps Embed API, gratuita).
// Sem a chave: só o pin no acesso, em satélite (embed público do Google Maps, sem rota).
const ACESSO = "-8.406433,-37.072890";   // acesso ao Novo São Cristóvão (guia de localização)
const GERES = "-8.412187,-37.0709993";   // VI GERES, referência pública

export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  const key = process.env.GOOGLE_MAPS_EMBED_KEY;
  if (key) {
    const q = new URLSearchParams({ key, origin: GERES, destination: ACESSO, mode: "driving", maptype: "satellite", language: "pt-BR", region: "BR" });
    return res.status(200).json({ modo: "rota", embed: "https://www.google.com/maps/embed/v1/directions?" + q });
  }
  const q = new URLSearchParams({ q: ACESSO, t: "k", z: "16", hl: "pt-BR", output: "embed" });
  return res.status(200).json({ modo: "pin", embed: "https://maps.google.com/maps?" + q });
}
