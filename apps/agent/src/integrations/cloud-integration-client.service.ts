import { Injectable } from '@nestjs/common';
import type { CommandResult } from '../command/command.service';
import { LicenseService } from '../license/license.service';

@Injectable()
export class CloudIntegrationClientService {
  private readonly baseUrl: string;
  private readonly oauthReturnUrl: string;

  constructor(private readonly licenseService: LicenseService) {
    this.baseUrl = (process.env.KDECK_WEB_URL ?? 'https://app.kdeck.io').replace(/\/+$/, '');
    this.oauthReturnUrl = process.env.KDECK_MOBILE_OAUTH_RETURN_URL ?? 'kdeck://oauth/done';
  }

  async execute(input: {
    pluginId: string;
    toolId: string;
    actionId: string;
    params: Record<string, unknown>;
    confirmed?: boolean;
  }): Promise<CommandResult> {
    const token = await this.licenseService.getAccessToken();
    if (!token) {
      return { success: false, error: 'Not signed in - open KDeck and sign in to use cloud tools.' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/integrations/actions/execute`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });
      const json = (await response.json().catch(() => ({}))) as CommandResult & { error?: string };

      if (!response.ok) {
        return {
          success: false,
          error: json.error ?? `Cloud action failed (${response.status})`,
        };
      }

      return json;
    } catch (err) {
      return {
        success: false,
        error: `Cloud action unreachable: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async startOAuth(pluginSlug: string): Promise<{
    success: boolean;
    authorizeUrl?: string;
    expiresAt?: string;
    error?: string;
  }> {
    const token = await this.licenseService.getAccessToken();
    if (!token) return { success: false, error: 'Not signed in - activate KDeck before connecting cloud plugins.' };

    try {
      const response = await fetch(`${this.baseUrl}/api/integrations/${encodeURIComponent(pluginSlug)}/oauth/start`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ returnUrl: this.oauthReturnUrl }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        authorizeUrl?: string;
        expiresAt?: string;
        error?: string;
        message?: string;
      };

      if (!response.ok || !json.authorizeUrl || !json.expiresAt) {
        return { success: false, error: json.message ?? json.error ?? `OAuth start failed (${response.status})` };
      }

      return { success: true, authorizeUrl: json.authorizeUrl, expiresAt: json.expiresAt };
    } catch (err) {
      return { success: false, error: `OAuth start unreachable: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  async getConnectionStatus(pluginSlug: string): Promise<{
    status: 'not_configured' | 'connected' | 'error' | 'expired';
    displayName?: string;
    providerAccountName?: string;
    scopes?: string[];
    expiresAt?: string;
    error?: string;
  }> {
    const token = await this.licenseService.getAccessToken();
    if (!token) return { status: 'error', error: 'Not signed in - activate KDeck before connecting cloud plugins.' };

    try {
      const response = await fetch(`${this.baseUrl}/api/integrations/${encodeURIComponent(pluginSlug)}/connection`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await response.json().catch(() => ({}))) as {
        status?: 'not_configured' | 'connected' | 'error' | 'expired';
        displayName?: string;
        providerAccountName?: string;
        scopes?: string[];
        expiresAt?: string;
        error?: string;
        message?: string;
      };

      if (!response.ok || !json.status) {
        return { status: 'error', error: json.message ?? json.error ?? `Connection status failed (${response.status})` };
      }

      return {
        status: json.status,
        displayName: json.displayName,
        providerAccountName: json.providerAccountName,
        scopes: json.scopes,
        expiresAt: json.expiresAt,
      };
    } catch (err) {
      return { status: 'error', error: `Connection status unreachable: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  async disconnect(pluginSlug: string): Promise<{ success: boolean; error?: string }> {
    const token = await this.licenseService.getAccessToken();
    if (!token) return { success: false, error: 'Not signed in - activate KDeck before disconnecting cloud plugins.' };

    try {
      const response = await fetch(`${this.baseUrl}/api/integrations/${encodeURIComponent(pluginSlug)}/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

      if (!response.ok) {
        return { success: false, error: json.message ?? json.error ?? `Disconnect failed (${response.status})` };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: `Disconnect unreachable: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
