// The few extension APIs the panel uses; the same in Chromium and Firefox.
declare namespace chrome.devtools {
  namespace inspectedWindow {
    interface EvalError {
      isError?: boolean;
      isException?: boolean;
      description?: string;
      value?: string;
    }
    function eval(expression: string, callback: (result: unknown, error?: EvalError) => void): void;
    function reload(options?: object): void;
  }
  namespace panels {
    const themeName: string | undefined;
    function create(title: string, iconPath: string, pagePath: string, callback?: (panel: unknown) => void): void;
  }
  namespace network {
    const onNavigated: { addListener(cb: (url: string) => void): void };
  }
}
