import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sha256hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.toLowerCase().trim())
  const hashBuf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: { key?: string; deviceFingerprint?: string; deviceName?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'INVALID_BODY' }, { status: 400, headers: corsHeaders })
  }

  const { key, deviceFingerprint, deviceName } = body
  if (!key || !deviceFingerprint) {
    return Response.json({ error: 'INVALID_KEY' }, { status: 400, headers: corsHeaders })
  }

  const keyHash = await sha256hex(key)

  const { data: license, error: licenseError } = await supabase
    .from('licenses')
    .select('id, user_id, status, device_fingerprint')
    .eq('key_hash', keyHash)
    .single()

  if (licenseError || !license) {
    return Response.json({ error: 'INVALID_KEY' }, { status: 400, headers: corsHeaders })
  }

  if (license.status === 'revoked') {
    return Response.json({ error: 'REVOKED' }, { status: 403, headers: corsHeaders })
  }

  if (license.status === 'active' && license.device_fingerprint !== deviceFingerprint) {
    return Response.json({ error: 'DEVICE_MISMATCH' }, { status: 409, headers: corsHeaders })
  }

  const now = new Date()
  const nextReset = new Date(now)
  nextReset.setMonth(nextReset.getMonth() + 1)
  nextReset.setDate(1)
  nextReset.setHours(0, 0, 0, 0)

  await supabase
    .from('licenses')
    .update({
      status:             'active',
      device_fingerprint: deviceFingerprint,
      device_name:        deviceName ?? null,
      activated_at:       now.toISOString(),
      credits_reset_at:   nextReset.toISOString(),
    })
    .eq('id', license.id)

  const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(license.user_id)
  if (userError || !user?.email) {
    return Response.json({ error: 'USER_NOT_FOUND' }, { status: 500, headers: corsHeaders })
  }

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type:  'magiclink',
    email: user.email,
  })
  if (linkError || !linkData?.properties?.hashed_token) {
    return Response.json({ error: 'SESSION_GENERATION_FAILED' }, { status: 500, headers: corsHeaders })
  }

  return Response.json(
    { hashed_token: linkData.properties.hashed_token },
    { status: 200, headers: corsHeaders },
  )
})
