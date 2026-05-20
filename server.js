import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

async function safeJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw_text: text };
  }
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "Luminay API",
    endpoints: ["/debug-meta", "/send-confirmation"]
  });
});

app.get("/debug-meta", async (req, res) => {
  try {
    const graphVersion = clean(process.env.GRAPH_VERSION) || "v25.0";
    const wabaId = clean(process.env.WHATSAPP_WABA_ID);
    const phoneNumberId = clean(process.env.WHATSAPP_PHONE_NUMBER_ID);
    const accessToken = clean(process.env.META_ACCESS_TOKEN);

    if (!accessToken || !wabaId || !phoneNumberId) {
      return res.status(500).json({
        error: "Missing environment variables",
        required: [
          "META_ACCESS_TOKEN",
          "WHATSAPP_WABA_ID",
          "WHATSAPP_PHONE_NUMBER_ID",
          "GRAPH_VERSION"
        ],
        seen: {
          META_ACCESS_TOKEN_EXISTS: Boolean(accessToken),
          WHATSAPP_WABA_ID: wabaId,
          WHATSAPP_PHONE_NUMBER_ID: phoneNumberId,
          GRAPH_VERSION: graphVersion
        }
      });
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`
    };

    const phoneNumbersUrl =
      `https://graph.facebook.com/${graphVersion}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`;

    const phoneIdUrl =
      `https://graph.facebook.com/${graphVersion}/${phoneNumberId}?fields=id,display_phone_number,verified_name`;

    const templatesUrl =
      `https://graph.facebook.com/${graphVersion}/${wabaId}/message_templates?fields=name,language,status,category`;

    const phoneNumbersRes = await fetch(phoneNumbersUrl, { headers });
    const phoneIdRes = await fetch(phoneIdUrl, { headers });
    const templatesRes = await fetch(templatesUrl, { headers });

    res.json({
      env_seen: {
        GRAPH_VERSION: graphVersion,
        WHATSAPP_WABA_ID: wabaId,
        WHATSAPP_PHONE_NUMBER_ID: phoneNumberId,
        META_ACCESS_TOKEN_EXISTS: Boolean(accessToken),
        META_ACCESS_TOKEN_FIRST_10_CHARS: accessToken.slice(0, 10)
      },
      phone_numbers_from_waba: {
        status: phoneNumbersRes.status,
        response: await safeJson(phoneNumbersRes)
      },
      phone_number_by_id: {
        status: phoneIdRes.status,
        response: await safeJson(phoneIdRes)
      },
      templates_from_waba: {
        status: templatesRes.status,
        response: await safeJson(templatesRes)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/send-confirmation", async (req, res) => {
  try {
    const {
      phone,
      customerName,
      orderId,
      orderTotal,
      templateName = "order_confirmation_demo_1",
      languageCode = "ar_EG"
    } = req.body;

    const graphVersion = clean(process.env.GRAPH_VERSION) || "v25.0";
    const phoneNumberId = clean(process.env.WHATSAPP_PHONE_NUMBER_ID);
    const accessToken = clean(process.env.META_ACCESS_TOKEN);

    if (!phone || !customerName || !orderId || !orderTotal) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["phone", "customerName", "orderId", "orderTotal"],
        received: req.body
      });
    }

    if (!accessToken || !phoneNumberId) {
      return res.status(500).json({
        error: "Missing environment variables",
        required: ["META_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]
      });
    }

    const endpoint =
      `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: clean(phone),
      type: "template",
      template: {
        name: clean(templateName),
        language: {
          code: clean(languageCode)
        },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: clean(customerName) },
              { type: "text", text: clean(orderId) },
              { type: "text", text: clean(orderTotal) }
            ]
          }
        ]
      }
    };

    const metaRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await safeJson(metaRes);

    res.status(metaRes.ok ? 200 : 400).json({
      ok: metaRes.ok,
      status: metaRes.status,
      request_debug: {
        endpoint,
        phone_number_id_used: phoneNumberId,
        graph_version_used: graphVersion,
        template_name_used: templateName,
        language_code_used: languageCode,
        recipient_used: phone
      },
      meta_response: result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Luminay API running on port ${PORT}`);
});
