# Novo São Cristóvão · Landing page (homologação)

Pronto para importar na Vercel: página estática + função `/api/lead`.

## Subir a homologação
1. Criar um repositório no GitHub da N4 e subir o conteúdo desta pasta.
2. Na Vercel: Add New > Project > importar o repositório. Framework: "Other". Sem build command.
3. Deploy. A URL `*.vercel.app` é o link de aprovação do cliente.
   O `vercel.json` envia `X-Robots-Tag: noindex` em todas as páginas: a homologação não aparece no Google.

## Ligar o N4 Flow (depois que a entrada de leads existir)
1. Em Settings > Environment Variables, preencher `N4FLOW_URL`, `N4FLOW_AUTH_HEADER`, `N4FLOW_AUTH_VALUE` (ver `.env.example`).
2. Em `index.html`, no objeto `LEAD_CONFIG`: `mode: "live"` e `endpoint: "/api/lead"`.
3. Redeploy e testar: envio válido, número inválido, número repetido, N4 Flow fora do ar.

## Antes de virar produção
- Remover a faixa "Protótipo" e o `<meta name="robots" content="noindex">` do `index.html`, e o cabeçalho `X-Robots-Tag` do `vercel.json`.
- Domínio próprio em Settings > Domains (registro DNS no provedor do domínio).
- GA4/GTM e Pixel da Meta; link da política de privacidade; número de WhatsApp; foto em alta resolução.
