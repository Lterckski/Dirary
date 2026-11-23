// Looks at a photo of a meal for the phone's food camera: what foods are on it, how much, and their calories.
// It asks Google Gemini on the free tier, so the key stays a Supabase secret and never ships inside the app.
// Only signed-in users can call it (Supabase checks the JWT before this runs).
//
// Free key (no card needed): https://aistudio.google.com/apikey
// Set the key once:   npx supabase secrets set GEMINI_API_KEY=<your key>
// Deploy:             npx supabase functions deploy food-photo
//
// Free tier trade-off: Google may use what free-tier calls send (the photo) to improve its products.
//
// Takes { image: <base64 JPEG> } and returns { food: boolean, items: [{ name, grams, kcal, protein_g }] },
// which the app reads with parseFoodPhoto in packages/shared/src/usda.ts.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Tried in order: the free tier often answers "high demand" for one model while another is fine. The lite
// models with little thinking answer in 2 to 7 seconds; gemini-3.5-flash took 30 to 70, too slow to wait for.
const MODELS = ['gemini-flash-lite-latest', 'gemini-3.1-flash-lite'];

const PROMPT = `You are a nutrition assistant for someone in the Philippines. Look at this photo.
If it shows no food or drink, answer food=false with no items.
Otherwise list each distinct food or drink you can see (for example rice, sinigang, fried chicken) as its own item.
Use the common Filipino dish name when there is one. For each item, estimate the portion in the photo in grams,
and the calories (kcal) and protein (g) of that whole portion. Use typical Philippine recipes and serving sizes.`;

const SCHEMA = {
  type: 'object',
  properties: {
    food: { type: 'boolean' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, grams: { type: 'number' }, kcal: { type: 'number' }, protein_g: { type: 'number' } },
        required: ['name', 'grams', 'kcal', 'protein_g'],
      },
    },
  },
  required: ['food', 'items'],
};

// Gemini's OpenAI-style endpoint: AI Studio's newer keys ("AQ.…") only work here, as a Bearer token.
async function ask(key: string, model: string, image: string): Promise<Response> {
  return await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      reasoning_effort: 'low',
      response_format: { type: 'json_schema', json_schema: { name: 'meal', schema: SCHEMA } },
      messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } }] }],
    }),
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return json({ error: 'The Gemini key is not set. Run: npx supabase secrets set GEMINI_API_KEY=<your key>' }, 500);

  let image = '';
  try {
    const body = await req.json();
    image = typeof body?.image === 'string' ? body.image : '';
  } catch {
    return json({ error: 'Send {"image": "<base64 JPEG>"}.' }, 400);
  }
  // About 7 MB of JPEG; Gemini takes up to 20 MB inline.
  if (image.length < 100 || image.length > 10_000_000) return json({ error: 'Send a JPEG photo under 7 MB.' }, 400);

  let status = 502;
  for (const model of MODELS) {
    const res = await ask(key, model, image).catch(() => null);
    if (!res?.ok) {
      status = res?.status ?? 504;
      continue;
    }
    const data = await res.json();
    try {
      return json(JSON.parse(data?.choices?.[0]?.message?.content));
    } catch {
      status = 502;
    }
  }
  return json({ error: status === 429 ? 'The free Gemini limit is used up for today. Try again tomorrow.' : 'Gemini is busy right now. Try again in a minute.' }, status === 429 ? 429 : 502);
});
