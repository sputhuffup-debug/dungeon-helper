/**
 * A component whose code loads the first time it renders. Unlike
 * `React.lazy`, a failed load (a chunk missing while offline before the
 * PWA cached it, say) shows an error with a retry, and the retry really
 * fetches again.
 */
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { errorMessage } from "../lib/format";
import { Loading } from "./Loading";
import { Button } from "./ui";

export interface LazyViewOptions<P> {
  /** Shown while the code loads. */
  loading?: (props: P) => ReactNode;
  /** Shown when the code fails to load. */
  failed?: (error: unknown, retry: () => void, props: P) => ReactNode;
  /** What is loading, for the default messages, e.g. "the booklet". */
  what?: string;
}

export function lazyView<P extends object>(load: () => Promise<ComponentType<P>>, opts: LazyViewOptions<P> = {}): ComponentType<P> {
  let loaded: ComponentType<P> | undefined;
  let pending: Promise<ComponentType<P>> | undefined;
  const get = () => {
    pending ??= load().then(
      (c) => (loaded = c),
      (err: unknown) => {
        pending = undefined;
        throw err;
      },
    );
    return pending;
  };
  const what = opts.what ?? "this view";

  function LazyView(props: P) {
    const [component, setComponent] = useState<{ C: ComponentType<P> } | undefined>(loaded ? { C: loaded } : undefined);
    const [error, setError] = useState<unknown>();
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
      if (component) return;
      let alive = true;
      setError(undefined);
      get().then(
        (C) => alive && setComponent({ C }),
        (e: unknown) => alive && setError(e),
      );
      return () => {
        alive = false;
      };
    }, [component, attempt]);
    if (component) return <component.C {...props} />;
    const retry = () => setAttempt((a) => a + 1);
    if (error !== undefined) {
      return opts.failed ? (
        opts.failed(error, retry, props)
      ) : (
        <div className="app-page" role="alert">
          <p className="cf-field__error">
            Could not load {what}: {errorMessage(error)}
          </p>
          <Button onClick={retry}>Retry</Button>
        </div>
      );
    }
    return opts.loading ? opts.loading(props) : <Loading label={`Loading ${what}…`} />;
  }
  return LazyView;
}
