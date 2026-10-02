const { loadEnvConfig } = require("@next/env");
const { join } = require("node:path");

loadEnvConfig(join(__dirname, ".."));

(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase URL or publishable key.");
  const response = await fetch(new URL("/auth/v1/settings", url), {
    headers: { apikey: key },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Supabase connection failed (HTTP ${response.status}).`);
  const settings = await response.json();
  if (!settings.external || typeof settings.external.email !== "boolean") {
    throw new Error("Unexpected response from Supabase Auth.");
  }
  console.log("Supabase Auth connection verified; publishable key accepted.");
  console.log(`Email sign-in enabled: ${settings.external.email}. Email confirmation required: ${!settings.mailer_autoconfirm}.`);
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
