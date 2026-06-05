import type { SourceId } from "../constants";
import type { MessageExtractor } from "../types";
import { freshdeskExtractor } from "./freshdesk";
import { gitlabExtractor } from "./gitlab";

export const extractors: MessageExtractor[] = [freshdeskExtractor, gitlabExtractor];

export function getExtractors(): MessageExtractor[] {
  return extractors;
}

export function detectSource(): SourceId | null {
  const extractor = extractors.find((item) => item.canHandle());
  return extractor?.id || null;
}

export function getExtractor(source?: SourceId | null): MessageExtractor | null {
  if (source) {
    return extractors.find((item) => item.id === source) || null;
  }
  return extractors.find((item) => item.canHandle()) || null;
}
