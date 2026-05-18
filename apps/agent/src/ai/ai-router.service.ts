import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { LicenseService } from '../license/license.service';

@Injectable()
export class AiRouterService {
  constructor(private readonly licenseService: LicenseService) {}

  async call(prompt: string, context: string): Promise<string> {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      throw new Error(
        'No AI provider configured. Set GEMINI_API_KEY in environment or .env file.',
      );
    }

    const genAI     = new GoogleGenerativeAI(geminiKey);
    const modelName = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
    const model     = genAI.getGenerativeModel({ model: modelName });

    const fullPrompt = context
      ? `Clipboard content:\n${context}\n\nInstruction:\n${prompt}`
      : prompt;

    const result = await model.generateContent(fullPrompt);
    const text   = result.response.text();

    this.licenseService.decrementCredit().catch(() => {});

    return text;
  }
}
