import { Injectable } from '@nestjs/common';
import { LicenseService } from '../license/license.service';

export class AiQuotaError extends Error {
  constructor() { super('AI quota exceeded'); }
}

@Injectable()
export class AiRouterService {
  constructor(private readonly licenseService: LicenseService) {}

  async call(prompt: string, context: string): Promise<string> {
    const accessToken = await this.licenseService.getAccessToken();
    if (!accessToken) {
      throw new Error('Not authenticated. Activate your license first.');
    }

    const supabaseUrl = process.env.SUPABASE_URL ?? '';
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL not configured.');
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/ai-proxy`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ prompt, context }),
    });

    if (response.status === 402) {
      throw new AiQuotaError();
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `AI proxy error: ${response.status}`);
    }

    const data = await response.json() as { text?: string };
    return data.text ?? '';
  }
}
