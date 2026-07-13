import { lazy, Suspense, useEffect } from 'react';

const CompatibilityBench = lazy(() =>
  import('./compat/CompatibilityBench').then((module) => ({
    default: module.CompatibilityBench,
  })),
);
const StudioView = lazy(() =>
  import('./studio/StudioView').then((module) => ({
    default: module.StudioView,
  })),
);
const VerticalSliceView = lazy(() =>
  import('./vertical-slice/VerticalSliceView').then((module) => ({
    default: module.VerticalSliceView,
  })),
);

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
    return (
      <Suspense fallback={<main className="route-loading">런타임 계측대 로딩 중</main>}>
        <CompatibilityBench />
      </Suspense>
    );
  }
  if (view === 'studio') {
    return (
      <Suspense fallback={<main className="route-loading">Studio 로딩 중</main>}>
        <StudioView />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<main className="route-loading">게임 로딩 중</main>}>
      <VerticalSliceView />
    </Suspense>
  );
}
