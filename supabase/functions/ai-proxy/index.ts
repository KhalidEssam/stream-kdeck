import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401, headers: corsHeaders })
  }
  const jwt = authHeader.slice(7)

  // Validate JWT
  const adminSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: { user }, error: userError } = await adminSupabase.auth.getUser(jwt)
  if (userError || !user) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401, headers: corsHeaders })
  }

  // Read custom claims embedded in JWT by the hook
  let licensed = false
  let aiPro = false
  let creditsRemaining = 0
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1]))
    licensed         = payload.licensed          ?? false
    aiPro            = payload.ai_pro            ?? false
    creditsRemaining = payload.credits_remaining ?? 0
  } catch {
    return Response.json({ error: 'INVALID_TOKEN' }, { status: 401, headers: corsHeaders })
  }

  if (!licensed) {
    return Response.json({ error: 'NOT_LICENSED' }, { status: 403, headers: corsHeaders })
  }
  if (creditsRemaining <= 0) {
    return Response.json({ error: 'QUOTA_EXCEEDED' }, { status: 402, headers: corsHeaders })
  }

  let prompt = ''
  let context = ''
  try {
    const body = await req.json()
    prompt  = body.prompt  ?? ''
    context = body.context ?? ''
  } catch {
    return Response.json({ error: 'INVALID_BODY' }, { status: 400, headers: corsHeaders })
  }

  if (!prompt) {
    return Response.json({ error: 'MISSING_PROMPT' }, { status: 400, headers: corsHeaders })
  }

  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!geminiKey) {
    return Response.json({ error: 'AI_NOT_CONFIGURED' }, { status: 500, headers: corsHeaders })
  }

  const modelName = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash'
  const fullPrompt = context
    ? `Clipboard content:\n${context}\n\nInstruction:\n${prompt}`
    : prompt

  const geminiResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] }),
    },
  )

  if (!geminiResp.ok) {
    const errText = await geminiResp.text()
    console.error('[ai-proxy] Gemini error:', geminiResp.status, errText)
    return Response.json({ error: 'AI_PROVIDER_ERROR' }, { status: 502, headers: corsHeaders })
  }

  const geminiData = await geminiResp.json()
  const text: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  // Decrement credits via user-scoped client so auth.uid() is set correctly
  const userSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } },
  )
  try {
    if (aiPro) {
      await userSupabase.rpc('decrement_subscription_credits')
    } else {
      await userSupabase.rpc('increment_license_credits_used')
    }
  } catch (e) {
    console.error('[ai-proxy] credit decrement failed:', e)
  }

  return Response.json({ text }, { status: 200, headers: corsHeaders })
})
