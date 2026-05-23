export interface ContextRequest {
  providerId: string;
  toolId: string;
  packId: string;
}

export interface ContextProbe {
  available: boolean;
  unavailableReason?: string;
}

export interface ContextPreview {
  label: string;
  byteSize: number;
  truncated: boolean;
  sampleText?: string;
}

export interface ContextPayload {
  providerId: string;
  content: string;
  byteSize: number;
  provenance: string;
}

export interface ContextProvider {
  readonly id: string;
  probe(request: ContextRequest): Promise<ContextProbe>;
  preview(request: ContextRequest): Promise<ContextPreview>;
  read(request: ContextRequest): Promise<ContextPayload>;
}
