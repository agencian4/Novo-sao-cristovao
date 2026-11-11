/**
 * Novo São Cristóvão · Captação de leads → N4 Flow
 * Função serverless de referência (formato Vercel/Netlify: export default handler(req, res)).
 *
 * STATUS: ARQUITETURA PREPARADA, NÃO INTEGRADA.
 * Nenhum endpoint ou credencial do N4 Flow está definido aqui. Enquanto as variáveis
 * de ambiente abaixo não existirem, a função responde 503 "integracao_nao_configurada"
 * e o lead NÃO é considerado entregue.
 *
 * Variáveis de ambiente (definidas no painel da hospedagem, nunca no front-end):
 *   N4FLOW_URL          <endereço do Flow>/api/integrations/forms (Módulo 7 do N4 Flow)
 *   N4FLOW_AUTH_HEADER  X-N4-Form-Key
 *   N4FLOW_AUTH_VALUE   chave do formulário, gerada em Flow › Configurações › Formulários
 *   LEAD_FALLBACK_URL   Opcional: destino de contingência (planilha, e-mail ou fila)
 */

const SCHEMA = "n4flow.lead.v1";
const FIXOS = {
  origem: "Landing Page",
  empreendimento: "Novo São Cristóvão",
  campanha: "Oferta à Vista R$ 15.000",
};

const onlyDigits = (s) => String(s || "").replace(/\D/g, "");
const validName = (v) => String(v || "").trim().split(/\s+/).filter((p) => /\p{L}{2,}/u.test(p)).length >= 2;
const normPhone = (v) => {
  let d = onlyDigits(v);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  return /^[1-9][1-9]9\d{8}$/.test(d) ? "+55" + d : null;
};
const nowRecife = () => new Date(Date.now() - 3 * 3600e3).toISOString().replace(/\.\d{3}Z$/, "-03:00");
const clip = (v, n = 200) => (v == null ? null : String(v).slice(0, n));

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, erro: "metodo_nao_permitido" });

  const body = typeof req.body === "string" ? safeJson(req.body) : req.body || {};
  const nome = String(body?.lead?.nome || "").trim().replace(/\s+/g, " ");
  const whatsapp = normPhone(body?.lead?.whatsapp);

  // 1. Validação no servidor (repete a do navegador; nunca confiar só no front-end)
  const erros = {};
  if (!validName(nome)) erros.nome = "Informe nome e sobrenome.";
  if (!whatsapp) erros.whatsapp = "WhatsApp inválido: DDD + 9 dígitos.";
  if (body?.consentimento?.aceito !== true) erros.consentimento = "Consentimento ausente.";
  if (Object.keys(erros).length) return res.status(422).json({ ok: false, erros });

  // 2. Payload canônico: campos fixos definidos no servidor, não aceitos do cliente
  const idempotencyKey = clip(req.headers["idempotency-key"] || body.idempotency_key, 64);
  const payload = {
    schema: SCHEMA,
    idempotency_key: idempotencyKey,
    lead: { nome: clip(nome, 120), whatsapp },
    ...FIXOS,
    campos: { empreendimento: FIXOS.empreendimento },
    utm: {
      source: clip(body?.utm?.source), medium: clip(body?.utm?.medium),
      campaign: clip(body?.utm?.campaign), content: clip(body?.utm?.content),
    },
    consentimento: {
      aceito: true,
      versao_texto: clip(body?.consentimento?.versao_texto, 40),
      metodo: "envio_do_formulario",
    },
    contexto: {
      cta_posicao: clip(body?.contexto?.cta_posicao, 40),
      data_hora_cliente: clip(body?.contexto?.data_hora_cliente, 40),
      data_hora_servidor: nowRecife(),
    },
  };

  // 3. Integração ainda não configurada: falha de forma explícita
  const { N4FLOW_URL, N4FLOW_AUTH_HEADER, N4FLOW_AUTH_VALUE } = process.env;
  if (!N4FLOW_URL || !N4FLOW_AUTH_HEADER || !N4FLOW_AUTH_VALUE) {
    await fallback(payload, "integracao_nao_configurada");
    return res.status(503).json({ ok: false, erro: "integracao_nao_configurada" });
  }

  // 4. Envio com nova tentativa (até 3, espera crescente). Duplicidade tratada pela chave
  //    de idempotência e pela regra de deduplicação do N4 Flow (a confirmar).
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const r = await fetch(N4FLOW_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [N4FLOW_AUTH_HEADER]: N4FLOW_AUTH_VALUE,
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      if (r.status === 409) return res.status(409).json({ ok: false, erro: "lead_duplicado" });
      // 200: lead criado ou atualizado (ou envio repetido); 202: guardado no Flow e na fila.
      if (r.ok) return res.status(200).json({ ok: true });
      if (r.status === 422) {                  // o Flow recusou o dado (ex.: telefone inválido)
        const detalhe = await r.json().catch(() => ({}));
        return res.status(422).json({ ok: false, erro: detalhe.error || "dados_recusados" });
      }
      if (r.status < 500) {                    // erro do contrato: não adianta repetir
        await fallback(payload, "n4flow_" + r.status);
        return res.status(502).json({ ok: false, erro: "n4flow_rejeitou" });
      }
    } catch (e) { /* timeout ou rede: tenta de novo */ }
    await new Promise((ok) => setTimeout(ok, 400 * tentativa));
  }
  await fallback(payload, "n4flow_indisponivel");
  return res.status(502).json({ ok: false, erro: "n4flow_indisponivel" });
}

// Contingência: nenhum lead se perde se o N4 Flow falhar. Destino a definir com o cliente.
async function fallback(payload, motivo) {
  const url = process.env.LEAD_FALLBACK_URL;
  console.error(JSON.stringify({ evento: "lead_contingencia", motivo, idempotency_key: payload.idempotency_key }));
  if (!url) return;
  try {
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo, payload }), signal: AbortSignal.timeout(5000) });
  } catch (e) { console.error("fallback_falhou"); }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
