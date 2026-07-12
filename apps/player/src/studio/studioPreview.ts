import type { PreviewSnapshot } from './studioTypes';

export type PreviewMessage =
  | {
      type: 'studio-preview:ready';
      runId: number;
    }
  | {
      type: 'studio-preview:state';
      runId: number;
      title: string;
      objectiveLabel: string;
      accentColor: string;
    }
  | {
      type: 'studio-preview:cleanup';
      runId: number;
      resources: {
        listeners: number;
        timers: number;
        rafs: number;
        canvases: number;
      };
    };

export function isPreviewMessage(value: unknown): value is PreviewMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const message = value as Record<string, unknown>;
  if (typeof message.runId !== 'number') {
    return false;
  }
  if (message.type === 'studio-preview:ready') {
    return true;
  }
  if (message.type === 'studio-preview:state') {
    return (
      typeof message.title === 'string' &&
      typeof message.objectiveLabel === 'string' &&
      typeof message.accentColor === 'string'
    );
  }
  if (message.type === 'studio-preview:cleanup') {
    const resources = message.resources as Record<string, unknown> | undefined;
    return (
      typeof resources?.listeners === 'number' &&
      typeof resources.timers === 'number' &&
      typeof resources.rafs === 'number' &&
      typeof resources.canvases === 'number'
    );
  }
  return false;
}

export function postPreviewSnapshot(
  frame: HTMLIFrameElement | null,
  snapshot: PreviewSnapshot,
): void {
  frame?.contentWindow?.postMessage(
    {
      type: 'studio-preview:update',
      snapshot,
    },
    '*',
  );
}

export function requestPreviewCleanup(frame: HTMLIFrameElement | null): void {
  frame?.contentWindow?.postMessage({ type: 'studio-preview:destroy' }, '*');
}

export function createPreviewSrc(runId: number): string {
  return `studio-preview.html?runId=${encodeURIComponent(String(runId))}`;
}
