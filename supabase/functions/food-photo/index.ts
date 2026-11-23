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

const MODEL = 'gemini-flash-latest';

const PROMPT = `You are a nutrition assistant for someone in the Philippines. Look at this photo.
If it shows no food or drink, answer food=false with no items.
Otherwise list each distinct food or drink you can see (for example rice, sinigang, fried chicken) as its own item.
Use the common Filipino dish name when there is one. For each item, estimate the portion in the photo in grams,
and the calories (kcal) and protein (g) of that whole portion. Use typical Philippine recipes and serving sizes.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    food: { type: 'BOOLEAN' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { name: { type: 'STRING' }, grams: { type: 'NUMBER' }, kcal: { type: 'NUMBER' }, protein_g: { type: 'NUMBER' } },
        required: ['name', 'grams', 'kcal', 'protein_g'],
      },
    },
  },
  required: ['food', 'items'],
};

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

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: image } }, { text: PROMPT }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 },
    }),
  });
  if (!res.ok) return json({ error: `Gemini answered ${res.status}.` }, res.status === 429 ? 429 : 502);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  try {
    return json(JSON.parse(text));
  } catch {
    return json({ error: 'Gemini gave no answer.' }, 502);
  }
});
