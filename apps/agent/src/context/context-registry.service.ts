import { Injectable } from '@nestjs/common';
import { ContextProvider, ContextRequest, ContextPayload } from './context-provider.interface';

@Injectable()
export class ContextRegistryService {
  private readonly providers = new Map<string, ContextProvider>();

  register(provider: ContextProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): ContextProvider | undefined {
    return this.providers.get(id);
  }

  async read(
    providerId: string,
    request: Omit<ContextRequest, 'providerId'>,
  ): Promise<ContextPayload> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return { providerId, content: '', byteSize: 0, provenance: `provider "${providerId}" not registered` };
    }

    const probe = await provider.probe({ ...request, providerId });
    if (!probe.available) {
      return {
        providerId,
        content: '',
        byteSize: 0,
        provenance: probe.unavailableReason ?? `provider "${providerId}" unavailable`,
      };
    }

    return provider.read({ ...request, providerId });
  }
}
