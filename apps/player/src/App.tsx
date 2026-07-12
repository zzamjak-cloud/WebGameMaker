import { useEffect } from 'react';
import { CompatibilityBench } from './compat/CompatibilityBench';
import { VerticalSliceView } from './vertical-slice/VerticalSliceView';

export default function App() {
  const view = new URLSearchParams(window.location.search).get('view');

  useEffect(() => {
    document.title =
      view === 'compat' ? 'WebGameMaker · 런타임 계측대' : '수문 07 · 마지막 등불';
  }, [view]);

  return view === 'compat' ? <CompatibilityBench /> : <VerticalSliceView />;
}
