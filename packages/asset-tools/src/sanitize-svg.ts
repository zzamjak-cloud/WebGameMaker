export class SvgSanitizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SvgSanitizeError";
  }
}

const FORBIDDEN = [
  /<script[\s>]/i,
  /\bon[a-z]+\s*=/i,
  /javascript:/i,
  /xlink:href\s*=\s*["']\s*https?:/i,
  /href\s*=\s*["']\s*https?:/i,
  /<foreignObject[\s>]/i,
];

/** 외부 참조·스크립트가 있으면 거부하고, 허용 SVG는 원문을 유지한다. */
export function sanitizeSvg(source: string): string {
  for (const pattern of FORBIDDEN) {
    if (pattern.test(source)) {
      throw new SvgSanitizeError("악성 또는 외부 참조 SVG는 등록할 수 없습니다.");
    }
  }
  if (!/<svg[\s>]/i.test(source)) {
    throw new SvgSanitizeError("유효한 SVG 루트가 없습니다.");
  }
  return source;
}
