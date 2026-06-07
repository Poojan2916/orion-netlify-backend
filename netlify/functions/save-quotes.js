const postgres = require("postgres");

const connectionString =
  process.env.DATABASE_URL ||
  process.env.NETLIFY_DB_URL ||
  process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL for Netlify Database connection. Add the Read and write connection string as DATABASE_URL in Netlify environment variables.");
}

const sql = postgres(connectionString, {
  ssl: "require",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const quotes = Array.isArray(body.quotes) ? body.quotes : [];

    await sql`
      CREATE TABLE IF NOT EXISTS quotation_state (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      INSERT INTO quotation_state (id, data, updated_at)
      VALUES ('main', ${sql.json(quotes)}, NOW())
      ON CONFLICT (id)
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `;

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        count: quotes.length,
        savedAt: new Date().toISOString(),
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
