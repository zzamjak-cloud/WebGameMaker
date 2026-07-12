import { useEffect } from 'react';
import { CompatibilityBench } from './compat/CompatibilityBench';
import { StudioView } from './studio/StudioView';
import { VerticalSliceView } from './vertical-slice/VerticalSliceView';

export default function App() {
  const view = new URLSearchParams(window.location.search).get('view');

  useEffect(() => {
    document.title =
      view === 'compat'
        ? 'WebGameMaker · 런타임 계측대'
        : view === 'studio'
          ? 'WebGameMaker · Studio'
          : '수문 07 · 마지막 등불';
  }, [view]);

  if (view === 'compat') {
    return <CompatibilityBench />;
  }
  if (view === 'studio') {
    return <StudioView />;
  }
  return <VerticalSliceView />;
}
