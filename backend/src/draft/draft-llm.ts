/** Claude 호출을 감싼 얇은 래퍼. DI 토큰으로 주입해 DraftService 테스트에서 가짜로 교체한다. */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { BadGatewayException, Injectable } from '@nestjs/common';
import { DraftOutput, DraftOutputSchema } from './prompt';

export const DRAFT_LLM = 'DRAFT_LLM';

export interface DraftLlm {
  generate(system: string, user: string): Promise<DraftOutput>;
}

@Injectable()
export class ClaudeDraftLlm implements DraftLlm {
  private client?: Anthropic;

  /**
   * 구조화 출력으로 분석+댓글을 1회 생성한다. 클라이언트는 첫 호출 때 만든다(키 없이도 서버가 떠야 하므로).
   * thinking 파라미터는 보내지 않는다 — 이 모델은 항상 켜져 있어 disabled 지정이 400.
   * @throws BadGatewayException 키 누락·API 오류·파싱 실패(parsed_output null)
   */
  async generate(system: string, user: string): Promise<DraftOutput> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new BadGatewayException('ANTHROPIC_API_KEY가 설정되지 않았습니다');
    }
    this.client ??= new Anthropic();
    try {
      const res = await this.client.messages.parse({
        model: 'claude-opus-5-5',
        max_tokens: 4000,
        system,
        messages: [{ role: 'user', content: user }],
        output_config: {
          format: zodOutputFormat(DraftOutputSchema),
          effort: 'medium',
        },
      });
      if (!res.parsed_output) {
        throw new BadGatewayException(
          `Claude 응답을 구조화 출력으로 해석하지 못했습니다 (stop_reason: ${res.stop_reason})`,
        );
      }
      return res.parsed_output;
    } catch (e) {
      if (e instanceof BadGatewayException) throw e;
      throw new BadGatewayException(`Claude API 오류: ${(e as Error).message}`);
    }
  }
}
