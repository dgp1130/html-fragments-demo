export interface Route {
  path: string;
  params: URLSearchParams;
  hash: string;
  toString(): string;
}

let currentRoute = createRoute(new URL(location.href));

export abstract class Router extends HTMLElement {
  protected abstract route(route: Route): Promise<DocumentFragment>;

  connectedCallback(): void {
    window.addEventListener('popstate', this.onRouteChange);
    this.addEventListener('click', this.onLinkNavigation);
  }

  disconnectedCallback(): void {
    this.removeEventListener('click', this.onLinkNavigation);
    window.removeEventListener('popstate', this.onRouteChange);
  }

  private onLinkNavigation = ((evt: Event) => {
    // Use composed path to pierce shadow DOM and avoid event re-targeting.
    const target = evt.composedPath()[0];
    if (!(target instanceof Element)) return;
    if (target.tagName !== 'A') return;

    // Don't actually navigate the browser.
    evt.preventDefault();

    // Trigger SPA navigation instead.
    const href = target.getAttribute('href');
    if (!href) throw new Error(`Clicked \`<a />\` tag with no \`href\` attribute.`);
    this.navigate(createRoute(new URL(href, location.href)));
  }).bind(this);

  private onRouteChange = (() => {
    this.navigate(createRoute(new URL(location.href)));
  }).bind(this);

  private fragmentCache = new Map<string, DocumentFragment>();
  private async navigate(route: Route): Promise<void> {
    const prevRoute = currentRoute;
    currentRoute = route;
    if (routeEquals(prevRoute, currentRoute)) return;
    history.pushState(undefined, '', `${route.path}${route.hash}`);

    // TODO: Cancel on multiple navigation events.
    const newFragment = this.fragmentCache.get(currentRoute.toString())
      ?? await this.route(currentRoute);

    const contentRoot = this.querySelector('slot:not([name])') ?? this;

    // Remove and cache the current fragment.
    const prevFragment = document.createDocumentFragment();
    prevFragment.append(...contentRoot.childNodes);
    this.fragmentCache.set(prevRoute.toString(), prevFragment);

    // Insert the new fragment.
    contentRoot.append(newFragment);
  }
}

function createRoute(url: URL): Route {
  return {
    path: url.pathname,
    params: url.searchParams,
    hash: url.hash,
    toString() {
      return `${this.path}?${this.params.toString()}${this.hash}`;
    }
  };
}

function routeEquals(first: Route, second: Route): boolean {
  if (first.path !== second.path) return false;
  if (first.hash !== second.hash) return false;

  const zippedParams = zip(Array.from(first.params.entries()), Array.from(second.params.entries()));
  for (const [ [ firstName, firstValue ], [ secondName, secondValue ] ] of zippedParams) {
    if (firstName !== secondName) return false;
    if (firstValue !== secondValue) return false;
  }

  return true;
}

function zip<T1, T2>(first: T1[], second: T2[]): Array<[T1, T2]> {
  if (first.length !== second.length) throw new Error();

  return first.map((f, i) => [f, second[i]!]);
}
