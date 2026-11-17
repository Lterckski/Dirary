// Searches USDA FoodData Central for the Health screen, so the API key stays a Supabase secret and never
// ships inside the app. Only signed-in users can call it (Supabase checks the JWT before this runs).
//
// Set the key once:   npx supabase secrets set USDA_API_KEY=<your key>
// Deploy:             npx supabase functions deploy usda-search
//
// Returns { foods: [...] } with only what the app reads: name, data type, kcal and protein per 100 g, and
// household measures. The app parses it with parseUsdaFoods in packages/shared/src/usda.ts.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Energy (kcal), the two Atwater energy figures Foundation foods use instead, and protein.
const NUTRIENTS = new Set([1008, 2047, 2048, 1003]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const key = Deno.env.get('USDA_API_KEY');
  if (!key) return json({ error: 'The USDA key is not set. Run: npx supabase secrets set USDA_API_KEY=<your key>' }, 500);

  let query = '';
  try {
    const body = await req.json();
    query = typeof body?.query === 'string' ? body.query.trim() : '';
  } catch {
    return json({ error: 'Send {"query": "..."}.' }, 400);
  }
  if (query.length < 2 || query.length > 60) return json({ error: 'Search for 2 to 60 characters.' }, 400);

  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', key);
  url.searchParams.set('query', query);
  url.searchParams.set('dataType', 'Foundation,SR Legacy,Survey (FNDDS)');
  url.searchParams.set('pageSize', '15');

  const res = await fetch(url);
  if (!res.ok) return json({ error: `USDA answered ${res.status}.` }, res.status === 429 ? 429 : 502);
  const data = await res.json();

  const foods = (Array.isArray(data?.foods) ? data.foods : []).map((f: Record<string, unknown>) => ({
    fdcId: f.fdcId,
    description: f.description,
    dataType: f.dataType,
    foodNutrients: (Array.isArray(f.foodNutrients) ? f.foodNutrients : [])
      .filter((n: Record<string, unknown>) => NUTRIENTS.has(Number(n.nutrientId)))
      .map((n: Record<string, unknown>) => ({ nutrientId: n.nutrientId, unitName: n.unitName, value: n.value })),
    foodMeasures: (Array.isArray(f.foodMeasures) ? f.foodMeasures : [])
      .map((m: Record<string, unknown>) => ({ disseminationText: m.disseminationText, gramWeight: m.gramWeight }))
      .slice(0, 6),
  }));
  return json({ foods });
});
