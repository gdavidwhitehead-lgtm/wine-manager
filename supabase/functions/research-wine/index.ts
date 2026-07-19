import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type WinePayload = {
  id: string;
  winery: string;
  wine: string;
  vintage?: number | null;
  varietal?: string;
  region?: string;
  country?: string;
  color?: string;
  professional_score?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function extractOutputText(response: any) {
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output || [])
    .flatMap((item: any) => item.content || [])
    .map((part: any) => part.text || "")
    .join("\n")
    .trim();
}

function parseResearch(text: string) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return {
      summary: cleaned,
      tasting_notes: [],
      producer_notes: [],
      pairing_ideas: [],
      buying_storage_notes: [],
      confidence: "Needs review",
      sources: [],
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("Authorization") || "";

  if (!openAiKey || !supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: "Backend secrets are not configured." }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: "Sign in before researching wines." }, 401);
  }

  const { wine } = (await req.json()) as { wine?: WinePayload };
  if (!wine?.id || !wine.winery || !wine.wine) {
    return jsonResponse({ error: "Wine id, winery, and wine are required." }, 400);
  }

  const vintage = wine.vintage || "NV";
  const prompt = `
Research this wine for a private cellar dashboard:

Wine: ${vintage} ${wine.winery} ${wine.wine}
Varietal/style: ${wine.varietal || "unknown"}
Region: ${wine.region || "unknown"}
Country: ${wine.country || "unknown"}
Color: ${wine.color || "unknown"}
Known score in cellar data: ${wine.professional_score || "not recorded"}

Use web search. Prefer official producer pages, wine-region associations, reputable retailer tech sheets, and critic/publication pages. Do not invent a rating, price, ABV, blend, or tasting note if you cannot verify it. If you find only producer-level information, say that clearly.

Return only valid JSON with this shape:
{
  "summary": "2-4 sentence concise summary",
  "tasting_notes": ["verified tasting/style detail"],
  "producer_notes": ["verified producer or region detail"],
  "pairing_ideas": ["food pairing idea grounded in wine style"],
  "buying_storage_notes": ["cellar, buying, or drinking note"],
  "confidence": "High | Medium | Low",
  "sources": [{"title": "source title", "url": "https://..."}]
}
`;

  const aiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      tools: [{ type: "web_search_preview", search_context_size: "medium" }],
      input: prompt,
    }),
  });

  if (!aiResponse.ok) {
    const detail = await aiResponse.text();
    return jsonResponse({ error: "OpenAI research request failed.", detail }, 502);
  }

  const aiJson = await aiResponse.json();
  const research = {
    ...parseResearch(extractOutputText(aiJson)),
    researched_at: new Date().toISOString(),
  };

  const { error: saveError } = await supabase.from("wine_research").upsert(
    {
      wine_id: wine.id,
      user_id: user.id,
      research,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "wine_id,user_id" },
  );

  if (saveError) {
    return jsonResponse({ error: "Research completed, but saving failed.", research }, 500);
  }

  return jsonResponse({ research });
});
