import * as PSN from "npm:psn-api";

const PSN_NPSSO = Deno.env.get("PSN_NPSSO")?.replace(/["']/g, "") || "";

async function getPsnId() {
  try {
    const accessCode = await PSN.exchangeNpssoForCode(PSN_NPSSO);
    const auth = await PSN.exchangeCodeForAccessToken(accessCode);
    console.log("AUTH_OBJECT:", JSON.stringify(auth));
  } catch (e) {
    console.error("PSN Error:", e);
  }
}

getPsnId();
